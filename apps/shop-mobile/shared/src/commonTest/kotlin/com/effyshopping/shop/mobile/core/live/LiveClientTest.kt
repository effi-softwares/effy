package com.effyshopping.shop.mobile.core.live

import com.effyshopping.mobile.kit.live.LiveClient
import com.effyshopping.mobile.kit.live.LiveConnection
import com.effyshopping.mobile.kit.live.LiveDescriptor
import com.effyshopping.mobile.kit.live.LiveKind
import com.effyshopping.mobile.kit.live.LiveState
import com.effyshopping.mobile.kit.live.LiveTransport
import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Instant
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest

/**
 * 071 — the mobile live client, against a fake socket and a virtual clock. The same behaviours the
 * web client's tests hold (`packages/web-kit/src/live/client.test.ts`): one protocol, two clients,
 * one set of rules.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class LiveClientTest {
    private val epochSeconds = 600L
    private val epoch = 2_932_000L

    /** Five minutes into the epoch. The virtual clock starts here. */
    private val startMillis = (epoch * epochSeconds + 300) * 1000
    private val prefix = "/shop/7f3c2a10-0000-4000-8000-000000000001"

    private class Socket(val host: String, val protocols: List<String>) {
        val sent = mutableListOf<String>()
        val incoming = Channel<String>(Channel.UNLIMITED)
        fun ofType(type: String) = sent.filter { it.contains("\"type\":\"$type\"") }
        fun id(frame: String) = Regex("\"id\":\"([^\"]+)\"").find(frame)!!.groupValues[1]
        fun lastSubscriptionId() = id(ofType("subscribe").last())
    }

    private class FakeTransport : LiveTransport {
        val sockets = mutableListOf<Socket>()
        var failToOpen = false

        override suspend fun connect(host: String, protocols: List<String>, session: suspend LiveConnection.() -> Unit) {
            if (failToOpen) error("offline")
            val socket = Socket(host, protocols)
            sockets += socket
            object : LiveConnection {
                override suspend fun send(text: String) { socket.sent += text }
                override suspend fun receive(): String = socket.incoming.receive()
            }.session()
        }
    }

    private class Harness(scope: TestScope, startMillis: Long, descriptor: () -> LiveDescriptor?, token: () -> String?) {
        val transport = FakeTransport()
        var descriptorCalls = 0
        val reads = mutableListOf<Long>()
        val client = LiveClient(
            scope = scope.backgroundScope,
            loadDescriptor = { descriptorCalls++; descriptor() },
            token = token,
            transport = transport,
            nowMillis = { startMillis + scope.testScheduler.currentTime },
            random = { 1.0 },
        )

        init {
            scope.backgroundScope.launch {
                client.changes(LiveKind.ORDERS).collect { reads += scope.testScheduler.currentTime }
            }
        }
    }

    private fun TestScope.harness(
        descriptor: (TestScope.() -> LiveDescriptor?)? = null,
        token: () -> String? = { "token-1" },
    ) = Harness(this, startMillis, { (descriptor ?: { descriptorNow() })() }, token)

    private fun TestScope.descriptorNow(skewMillis: Long = 0) = LiveDescriptor(
        httpHost = "x.appsync-api.example",
        realtimeHost = "x.appsync-realtime-api.example",
        channelPrefix = prefix,
        epochSeconds = epochSeconds,
        serverTime = Instant.fromEpochMilliseconds(startMillis + testScheduler.currentTime + skewMillis).toString(),
    )

    private fun TestScope.goLive(h: Harness): Socket {
        runCurrent()
        val socket = h.transport.sockets.last()
        socket.incoming.trySend("""{"type":"connection_ack","connectionTimeoutMs":300000}""")
        runCurrent()
        socket.incoming.trySend("""{"type":"subscribe_success","id":"${socket.lastSubscriptionId()}"}""")
        runCurrent()
        return socket
    }

    @OptIn(ExperimentalEncodingApi::class)
    @Test
    fun opensTheSocketWithBothSubprotocolsAndSubscribesToThisEpoch() = runTest {
        val h = harness()
        h.client.start()
        val socket = goLive(h)

        assertEquals("x.appsync-realtime-api.example", socket.host)
        assertEquals("aws-appsync-event-ws", socket.protocols[0])
        val encoded = socket.protocols[1].removePrefix("header-")
        assertFalse(encoded.contains('+') || encoded.contains('/') || encoded.contains('='))
        val header = Base64.UrlSafe.withPadding(Base64.PaddingOption.ABSENT_OPTIONAL).decode(encoded).decodeToString()
        assertTrue(header.contains("\"host\":\"x.appsync-api.example\""))
        assertTrue(header.contains("\"Authorization\":\"token-1\""))

        assertEquals(1, socket.ofType("connection_init").size)
        assertTrue(socket.ofType("subscribe").single().contains("\"channel\":\"$prefix/$epoch\""))
        assertEquals(LiveState.LIVE, h.client.state.value)
        // Connecting reads once: whatever happened while away is unknown.
        assertEquals(1, h.reads.size)
        assertTrue(socket.ofType("publish").isEmpty())
    }

    @Test
    fun picksTheEpochFromTheServersClockNotTheDevices() = runTest {
        val h = harness(descriptor = { descriptorNow(skewMillis = 40 * 60_000) })
        h.client.start()
        val socket = goLive(h)
        assertTrue(socket.ofType("subscribe").single().contains("$prefix/${epoch + 4}\""))
    }

    @Test
    fun anUpdateOfAWantedKindIsOneReadAndOtherKindsAreIgnored() = runTest {
        val h = harness()
        h.client.start()
        val socket = goLive(h)
        advanceTimeBy(30_000) // well clear of the connect's own read
        val id = socket.lastSubscriptionId()

        socket.incoming.trySend("""{"type":"data","id":"$id","event":["{\"k\":\"orders\"}"]}""")
        runCurrent()
        assertEquals(2, h.reads.size)

        socket.incoming.trySend("""{"type":"data","id":"$id","event":["{\"k\":\"stock\"}"]}""")
        socket.incoming.trySend("""{"type":"data","id":"$id","event":["{\"k\":\"prices\"}"]}""")
        socket.incoming.trySend("""{"type":"data","id":"$id","event":["not json"]}""")
        socket.incoming.trySend("not json at all")
        socket.incoming.trySend("""{"type":"data","id":"someone-else","event":["{\"k\":\"orders\"}"]}""")
        runCurrent()
        advanceTimeBy(10_000)
        assertEquals(2, h.reads.size)
    }

    // SC-012 — ten changes within ten seconds are no more than three reads, the last after the last.
    @Test
    fun aBurstOfTenUpdatesIsAtMostThreeReads() = runTest {
        val h = harness()
        h.client.start()
        val socket = goLive(h)
        advanceTimeBy(30_000)
        val before = h.reads.size
        val id = socket.lastSubscriptionId()

        var lastSentAt = 0L
        repeat(10) {
            socket.incoming.trySend("""{"type":"data","id":"$id","event":["{\"k\":\"orders\"}"]}""")
            runCurrent()
            lastSentAt = testScheduler.currentTime
            advanceTimeBy(900)
        }
        advanceTimeBy(10_000)

        val burst = h.reads.drop(before)
        assertTrue(burst.size in 2..3, "expected 2–3 reads, got ${burst.size}")
        assertTrue(burst.last() >= lastSentAt)
    }

    // SC-003 — an hour connected and idle: the descriptor is looked up once and nothing is read.
    @Test
    fun anIdleHourReadsNothing() = runTest {
        val h = harness()
        h.client.start()
        val socket = goLive(h)

        repeat(120) {
            advanceTimeBy(30_000)
            socket.incoming.trySend("""{"type":"ka"}""")
            runCurrent()
            socket.incoming.trySend("""{"type":"subscribe_success","id":"${socket.lastSubscriptionId()}"}""")
            runCurrent()
        }

        assertEquals(LiveState.LIVE, h.client.state.value)
        assertEquals(1, h.descriptorCalls)
        assertEquals(1, h.reads.size)
        assertEquals(1, h.transport.sockets.size)
        assertTrue(socket.ofType("subscribe").size in 6..8)
    }

    @Test
    fun movesToTheNextEpochAMinuteEarlyAndDropsTheOldOneAMinuteAfter() = runTest {
        val h = harness()
        h.client.start()
        val socket = goLive(h)
        val firstId = socket.lastSubscriptionId()

        advanceTimeBy(239_000)
        socket.incoming.trySend("""{"type":"ka"}""")
        runCurrent()
        assertEquals(1, socket.ofType("subscribe").size)
        advanceTimeBy(1_100)
        assertEquals(2, socket.ofType("subscribe").size)
        assertTrue(socket.ofType("subscribe")[1].contains("$prefix/${epoch + 1}\""))

        socket.incoming.trySend("""{"type":"subscribe_success","id":"${socket.lastSubscriptionId()}"}""")
        runCurrent()
        assertEquals(1, h.reads.size) // no second catch-up: nothing was missed

        advanceTimeBy(118_000)
        socket.incoming.trySend("""{"type":"ka"}""")
        runCurrent()
        assertTrue(socket.ofType("unsubscribe").isEmpty())
        advanceTimeBy(2_000)
        assertEquals("""{"type":"unsubscribe","id":"$firstId"}""", socket.ofType("unsubscribe").single())
        assertEquals(LiveState.LIVE, h.client.state.value)
    }

    // FR-023 / SC-009 — how a person whose access has ended stops hearing.
    @Test
    fun goesOffWhenTheNextEpochIsRefusedAndDoesNotRetry() = runTest {
        val h = harness()
        h.client.start()
        val socket = goLive(h)
        advanceTimeBy(240_100)

        socket.incoming.trySend("""{"type":"subscribe_error","id":"${socket.lastSubscriptionId()}"}""")
        runCurrent()
        assertEquals(LiveState.OFF, h.client.state.value)

        advanceTimeBy(30 * 60_000)
        assertEquals(1, h.transport.sockets.size)
        assertEquals(1, h.descriptorCalls)
    }

    @Test
    fun goesOffWhenTheSessionHasEndedByTheNextEpoch() = runTest {
        var tokens = 0
        val h = harness(token = { if (tokens++ < 2) "token-1" else null })
        h.client.start()
        goLive(h)
        advanceTimeBy(240_100)
        assertEquals(LiveState.OFF, h.client.state.value)
    }

    @Test
    fun isOffWithNoChannelOrNoSessionAndOpensNothing() = runTest {
        val none = harness(descriptor = { null })
        none.client.start()
        runCurrent()
        assertEquals(LiveState.OFF, none.client.state.value)
        assertTrue(none.transport.sockets.isEmpty())
        advanceTimeBy(10 * 60_000)
        assertEquals(1, none.descriptorCalls)

        val signedOut = harness(token = { null })
        signedOut.client.start()
        runCurrent()
        assertEquals(LiveState.OFF, signedOut.client.state.value)
        assertTrue(signedOut.transport.sockets.isEmpty())
    }

    // SC-004 — back after a lost connection: the current state, with no action by the person.
    @Test
    fun reconnectsWithBackoffAndReadsOnceWhenItIsBack() = runTest {
        val h = harness()
        h.client.start()
        val first = goLive(h)

        first.incoming.close()
        runCurrent()
        assertEquals(LiveState.RECONNECTING, h.client.state.value)
        advanceTimeBy(999)
        assertEquals(1, h.transport.sockets.size)
        advanceTimeBy(2)
        goLive(h)

        assertEquals(2, h.transport.sockets.size)
        assertEquals(LiveState.LIVE, h.client.state.value)
        assertEquals(2, h.descriptorCalls)
        advanceTimeBy(2_000)
        assertEquals(2, h.reads.size)
    }

    @Test
    fun backsOffLongerEachTimeUpToAMinute() = runTest {
        val h = harness()
        h.transport.failToOpen = true
        h.client.start()
        runCurrent()
        assertEquals(1, h.descriptorCalls)
        advanceTimeBy(1_001); assertEquals(2, h.descriptorCalls)
        advanceTimeBy(2_001); assertEquals(3, h.descriptorCalls)
        advanceTimeBy(4_001); assertEquals(4, h.descriptorCalls)
        advanceTimeBy(10 * 60_000)
        val before = h.descriptorCalls
        advanceTimeBy(60_001)
        assertEquals(before + 1, h.descriptorCalls)
    }

    @Test
    fun treatsASilentConnectionAsDead() = runTest {
        val h = harness()
        h.client.start()
        goLive(h)
        // No keep-alive for the channel's stated five minutes (the epoch roll's subscribe is not a
        // frame FROM the channel): the client gives the connection up and starts again.
        advanceTimeBy(300_001)
        runCurrent()
        assertTrue(h.client.state.value != LiveState.LIVE || h.transport.sockets.size == 2)
    }

    @Test
    fun stopClosesAndStaysClosed() = runTest {
        val h = harness()
        h.client.start()
        goLive(h)
        h.client.stop()
        assertEquals(LiveState.OFF, h.client.state.value)
        advanceTimeBy(60 * 60_000)
        assertEquals(1, h.transport.sockets.size)

        h.client.start()
        goLive(h)
        assertEquals(LiveState.LIVE, h.client.state.value)
    }
}
