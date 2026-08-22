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
 * Drains the [OfflineQueue] against the platform (049 US6, FR-039/040).
 *
 * Replays each queued action in FIFO order, one at a time (a [Mutex] stops two drains interleaving).
 * Because the backend is idempotent by `changeId`, a replay of an already-applied action is a safe
 * no-op — so the ONLY failure this must handle carefully is the network being down again, in which case
 * it stops and leaves the rest queued for the next trigger.
 *
 * Outcomes per action:
 *  - **2xx** (applied, or a benign idempotent no-op) → remove from the queue.
 *  - **Network down again** → stop the drain; keep this and the rest for the next trigger.
 *  - **Definitive refusal** (a 4xx that is not network — e.g. the run ended, a validation error) →
 *    **dead-letter** it (remove) after a few attempts: retrying forever cannot help, and the backend
 *    has already decided. The mirror reconciles on the next read.
 *
 * Triggered on app launch and on the home refresh (the driver coming back online refreshes there). No
 * connectivity API is assumed; a trigger that runs while still offline simply fails fast and re-queues.
 */
class SyncCoordinator(
    private val client: HttpClient,
    private val queue: OfflineQueue,
) {
    private val lock = Mutex()

    /** Attempt to flush every pending action. Safe to call repeatedly; a no-op when the queue is empty. */
    suspend fun flush() {
        if (queue.count == 0) return
        lock.withLock {
            while (true) {
                val action = queue.peek() ?: break
                when (replay(action)) {
                    Result.Applied -> queue.remove(action.changeId)
                    Result.Dead -> queue.remove(action.changeId)
                    Result.Retry -> {
                        queue.bumpAttempts(action.changeId)
                        if (action.attempts + 1 >= MAX_ATTEMPTS) queue.remove(action.changeId) else break
                    }
                    Result.Offline -> break // still offline — leave everything for the next trigger
                }
            }
        }
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
