package com.effyshopping.driver.mobile.core.offline

import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.core.http.ensureSuccess
import io.ktor.client.HttpClient
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.content.TextContent
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.io.IOException

/**
 * Drains the [OfflineQueue] against the platform.
 *
 * Replays each queued action in FIFO order, one at a time (a [Mutex] stops two drains interleaving).
 * Because the backend is idempotent by `changeId`, a replay of an already-applied action is a safe
 * no-op — so the only failure this must handle carefully is the network being down again, in which case
 * it stops and leaves the rest queued for the next trigger.
 *
 * Outcomes per action:
 *  - **2xx** (applied, or a benign idempotent no-op) → remove from the queue.
 *  - **Network down again** → stop the drain; keep this and the rest for the next trigger.
 *  - **Definitive refusal** (a 4xx that is not network — e.g. the run ended, a validation error) →
 *  stop sending it and keep it as **refused** ([OfflineQueue.refused]) so the driver is told:
 *  retrying forever cannot help, and the backend has already decided.
 *
 * Triggered on app launch and on the home refresh (the driver coming back online refreshes there). No
 * connectivity API is assumed; a trigger that runs while still offline simply fails fast and re-queues.
 */
class SyncCoordinator(
    private val client: HttpClient,
    private val queue: OfflineQueue,
    /** Proofs saved with no signal (backlog B3). Sent after the queue, so a drop's "arrived" lands first. */
    private val proofs: ProofOutbox? = null,
    private val sendProofs: suspend () -> Unit = {},
    /**
     * Rev 2 — something saved with no signal has now reached the platform: the screens showing work
     * re-read (`WorkChanges.changed`). Called once per flush, however many landed.
     */
    private val onDelivered: () -> Unit = {},
) {
    private val lock = Mutex()

    /** Attempt to flush every pending action. Safe to call repeatedly; a no-op when nothing waits. */
    suspend fun flush() {
        if (queue.count == 0 && proofs?.pending?.value.isNullOrEmpty()) return
        lock.withLock {
            val settled = drainQueue()
            val proofsBefore = proofs?.pending?.value?.size ?: 0
            if (queue.count == 0) sendProofs()
            val proofsSent = proofsBefore - (proofs?.pending?.value?.size ?: 0)
            if (settled > 0 || proofsSent > 0) onDelivered()
        }
    }

    /**
     * Replays the queue in order; answers how many actions the platform settled — applied, or refused
     * (a refused one was shown as done on the phone, so the screens must re-read to un-show it).
     */
    private suspend fun drainQueue(): Int {
        var settled = 0
        while (true) {
            val action = queue.peek() ?: break
            when (replay(action)) {
                Result.Applied -> { queue.remove(action.changeId); settled++ }
                Result.Dead -> { queue.refuse(action.changeId); settled++ }
                Result.Retry -> {
                    queue.bumpAttempts(action.changeId)
                    if (action.attempts + 1 >= MAX_ATTEMPTS) { queue.refuse(action.changeId); settled++ } else break
                }
                Result.Offline -> break // still offline — leave everything for the next trigger
            }
        }
        return settled
    }

    private enum class Result { Applied, Offline, Retry, Dead }

    private suspend fun replay(action: PendingAction): Result =
        try {
            client.post(action.path) {
                setBody(TextContent(action.bodyJson, ContentType.Application.Json))
            }.ensureSuccess()
            Result.Applied
        } catch (e: AppException) {
            when (e.error) {
                AppError.Network, AppError.Unavailable -> Result.Offline
                // A duplicate that the backend already applied can surface as Conflict — treat as applied.
                AppError.Conflict -> Result.Applied
                // Auth loss: stop trying (the session gate will handle re-auth); keep queued.
                AppError.Unauthenticated -> Result.Offline
                // Refused because its round has not opened: Early, not wrong. It can only be
                // here if the phone's clock ran ahead of the server's when the driver acted offline.
                // Kept, in order, and tried again on the next flush. Before 072 named this case it
                // would have arrived as Conflict and been dropped as "already applied".
                is AppError.NotOpenYet -> Result.Offline
                else -> Result.Dead // NotFound / Validation / Forbidden — a definitive refusal.
            }
        } catch (e: IOException) {
            Result.Offline
        } catch (e: UnresolvedAddressException) {
            Result.Offline
        } catch (e: Throwable) {
            Result.Retry
        }

    private companion object {
        const val MAX_ATTEMPTS = 5
    }
}
