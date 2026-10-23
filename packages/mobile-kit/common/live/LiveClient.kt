package com.effyshopping.mobile.kit.live

import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi
import kotlin.math.min
import kotlin.math.pow
import kotlin.random.Random
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * The live-update client, the same state machine as `packages/web-kit/src/live/client.ts` on
 * coroutines. It carries no data: ViewModels collect [changes] and re-read through their repositories.
 * Its delays keep the connection alive, back off reconnects and move to the next ten-minute epoch; none
 * reads anything. The epoch is how access is re-checked, so a refused subscription is an answer.
 * Foreground only: [start] when foregrounded and signed in, [stop] when either ends.
 */
class LiveClient(
    private val scope: CoroutineScope,
    /** This audience's `GET /…/v1/live`. `null`: no channel for this person. Throwing: retry. */
    private val loadDescriptor: suspend () -> LiveDescriptor?,
    /** The token the app sends to the API. `null` when signed out. */
    private val token: suspend () -> String?,
    private val transport: LiveTransport,
    private val nowMillis: () -> Long = { Clock.System.now().toEpochMilliseconds() },
    private val random: () -> Double = { Random.nextDouble() },
) {
    private val mutableState = MutableStateFlow(LiveState.OFF)
    val state: StateFlow<LiveState> = mutableState.asStateFlow()

    // Slow collectors must not hold the socket up; a missed emission is followed by another, and re-reads are idempotent.
    private val updates = MutableSharedFlow<LiveKind>(extraBufferCapacity = 16)
    private val caughtUp = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

    private var job: Job? = null
    private val coalescers = mutableMapOf<LiveKind, Coalescer>()

    /** "Read now": one of [kinds] changed, or the channel (re)connected. Coalesced; the last emission follows the last update. */
    fun changes(vararg kinds: LiveKind): Flow<Unit> {
        val wanted = kinds.toSet()
        return kotlinx.coroutines.flow.merge(updates.filter { it in wanted }.map { }, caughtUp)
    }

    /** Connect, or reconnect if off. Does nothing when already connecting or live. */
    fun start() {
        if (job?.isActive == true) return
        job = scope.launch { run() }
    }

    /** Close the connection and stay closed until [start]. */
    fun stop() {
        job?.cancel()
        job = null
        coalescers.values.forEach { it.cancel() }
        coalescers.clear()
        mutableState.value = LiveState.OFF
    }

    private suspend fun run() {
        var attempts = 0
        while (true) {
            mutableState.value = LiveState.RECONNECTING
            var wasLive = false
            val ended = try {
                session(onLive = { wasLive = true })
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                Ended.LOST
            }
            if (ended == Ended.OFF) {
                mutableState.value = LiveState.OFF
                return
            }
            mutableState.value = LiveState.RECONNECTING
            if (wasLive) attempts = 0
            // Jittered, so devices that lost the same network do not all return together.
            val ceiling = min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2.0.pow(attempts).toLong())
            attempts++
            delay((ceiling * (0.5 + random() * 0.5)).toLong())
        }
    }

    private enum class Ended { OFF, LOST }

    @OptIn(ExperimentalEncodingApi::class)
    private suspend fun session(onLive: () -> Unit): Ended {
        // The channel first, then the token (as the web client does).
        val descriptor = loadDescriptor() ?: return Ended.OFF
        val handshakeToken = token() ?: return Ended.OFF

        val serverNow = runCatching { Instant.parse(descriptor.serverTime).toEpochMilliseconds() }.getOrNull()
        val clockOffset = if (serverNow == null) 0L else serverNow - nowMillis()
        fun serverNowMillis() = nowMillis() + clockOffset
        fun epochNow() = serverNowMillis() / 1000 / descriptor.epochSeconds

        val header = buildJsonObject {
            put("host", descriptor.httpHost)
            put("Authorization", handshakeToken)
        }.toString()
        val protocols = listOf(
            SUBPROTOCOL,
            "header-" + Base64.UrlSafe.encode(header.encodeToByteArray()).trimEnd('='),
        )

        var ended = Ended.LOST
        transport.connect(descriptor.realtimeHost, protocols) {
            val connection = this
            // A child that finds the session gone fails this scope with AccessEnded, caught outside the scope.
            try { coroutineScope {
                val subscriptions = mutableMapOf<Long, String>() // epoch → subscription id
                var nextId = 0
                var caughtUpOnce = false
                var keepAliveTimeout = DEFAULT_KEEPALIVE_TIMEOUT_MS

                suspend fun subscribe(epoch: Long): Boolean {
                    if (epoch in subscriptions) return true
                    // A fresh token each time: the access check must see who this is now.
                    val current = token() ?: return false
                    val id = "s${++nextId}"
                    subscriptions[epoch] = id
                    connection.send(
                        buildJsonObject {
                            put("type", "subscribe")
                            put("id", id)
                            put("channel", "${descriptor.channelPrefix}/$epoch")
                            putJsonObject("authorization") {
                                put("Authorization", current)
                                put("host", descriptor.httpHost)
                            }
                        }.toString(),
                    )
                    return true
                }

                connection.send("""{"type":"connection_init"}""")

                var rollJob: Job? = null
                var dropJob: Job? = null
                try {
                    while (true) {
                        // No frame within the stated timeout: the connection is dead, however open the socket claims to be.
                        val raw = withTimeoutOrNull(keepAliveTimeout) { connection.receive() } ?: break
                        val message = runCatching { JSON.parseToJsonElement(raw).jsonObject }.getOrNull() ?: continue
                        val id = message.string("id")
                        val epochOf = subscriptions.entries.firstOrNull { it.value == id }?.key

                        when (message.string("type")) {
                            "connection_ack" -> {
                                message["connectionTimeoutMs"]?.jsonPrimitive?.longOrNull
                                    ?.takeIf { it > 0 }?.let { keepAliveTimeout = it }
                                if (!subscribe(epochNow())) { ended = Ended.OFF; break }
                            }
                            "ka" -> Unit
                            "subscribe_success" -> if (epochOf != null) {
                                mutableState.value = LiveState.LIVE
                                onLive()
                                if (!caughtUpOnce) {
                                    // First subscription of this connection: anything may have changed meanwhile.
                                    caughtUpOnce = true
                                    caughtUp.tryEmit(Unit)
                                } else {
                                    // The next epoch is in place; drop the previous one once the overlap passes.
                                    val old = epochOf - 1
                                    dropJob?.cancel()
                                    dropJob = launch {
                                        delay((epochOf * descriptor.epochSeconds * 1000 + EPOCH_MARGIN_MS - serverNowMillis()).coerceAtLeast(0))
                                        subscriptions.remove(old)?.let { oldId ->
                                            connection.send("""{"type":"unsubscribe","id":"$oldId"}""")
                                        }
                                    }
                                }
                                // Subscribe to the next epoch a minute before it begins.
                                rollJob?.cancel()
                                rollJob = launch {
                                    delay(((epochOf + 1) * descriptor.epochSeconds * 1000 - EPOCH_MARGIN_MS - serverNowMillis()).coerceAtLeast(0))
                                    if (!subscribe(epochOf + 1)) throw AccessEnded()
                                }
                            }
                            // Refused: access has ended, or there never was a channel.
                            "subscribe_error" -> if (epochOf != null) { ended = Ended.OFF; break }
                            "data" -> if (epochOf != null) {
                                val events = when (val event = message["event"]) {
                                    is JsonArray -> event.toList()
                                    null -> emptyList()
                                    else -> listOf(event)
                                }
                                for (event in events) {
                                    val text = (event as? JsonPrimitive)?.contentOrNull ?: continue
                                    val kind = runCatching {
                                        LiveKind.fromWire(JSON.parseToJsonElement(text).jsonObject.string("k"))
                                    }.getOrNull() ?: continue
                                    coalescerFor(kind).trigger()
                                }
                            }
                            "connection_error", "error" -> break
                            else -> Unit // a message this build has never heard of
                        }
                    }
                } finally {
                    rollJob?.cancel()
                    dropJob?.cancel()
                }
            } } catch (_: AccessEnded) {
                ended = Ended.OFF
            }
        }
        return ended
    }

    /** The session ended while the next epoch was due: there is no token to subscribe with. */
    private class AccessEnded : RuntimeException()

    private fun coalescerFor(kind: LiveKind): Coalescer =
        coalescers.getOrPut(kind) { Coalescer(scope, nowMillis) { updates.tryEmit(kind) } }

    private fun JsonObject.string(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull

    private companion object {
        const val SUBPROTOCOL = "aws-appsync-event-ws"
        const val BACKOFF_BASE_MS = 1_000L
        const val BACKOFF_MAX_MS = 60_000L
        const val EPOCH_MARGIN_MS = 60_000L
        const val DEFAULT_KEEPALIVE_TIMEOUT_MS = 300_000L
        val JSON = Json { ignoreUnknownKeys = true }
    }
}

/**
 * Turns a burst of "something changed" into a few reads, as `packages/web-kit/src/live/coalesce.ts`:
 * the first update emits at once, then one more after a second of quiet, or after five.
 */
internal class Coalescer(
    private val scope: CoroutineScope,
    private val nowMillis: () -> Long,
    private val quietMs: Long = 1_000,
    private val maxWaitMs: Long = 5_000,
    private val emit: () -> Unit,
) {
    private var burstUntil = 0L
    private var pending: Job? = null
    private var firstPendingAt = 0L

    fun trigger() {
        val now = nowMillis()
        if (pending == null && now >= burstUntil) {
            burstUntil = now + quietMs
            emit()
            return
        }
        if (pending == null) firstPendingAt = now
        pending?.cancel()
        val wait = min(quietMs, firstPendingAt + maxWaitMs - now).coerceAtLeast(0)
        pending = scope.launch {
            delay(wait)
            pending = null
            burstUntil = nowMillis() + quietMs
            emit()
        }
    }

    fun cancel() {
        pending?.cancel()
        pending = null
    }
}
