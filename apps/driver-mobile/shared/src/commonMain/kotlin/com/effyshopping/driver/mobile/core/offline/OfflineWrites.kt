package com.effyshopping.driver.mobile.core.offline

import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException

/** What became of a driver's write: it reached the platform, or it is saved on the phone to send. */
enum class WriteOutcome { SENT, QUEUED }

/**
 * Wrap a driver mutation so a network failure never loses the write. With no connection (including
 * Ktor's IOException), the action is queued for replay (idempotent by `changeId`) and [queued] is returned:
 * accepted, not failed, so the driver does not tap again. A real refusal propagates and is not queued.
 */
suspend inline fun <T> OfflineQueue.withReplay(
    path: String,
    bodyJson: String,
    changeId: String,
    label: String,
    queued: () -> T,
    block: () -> T,
): T =
    try {
        block()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Throwable) {
        if (!e.isOffline()) throw e
        enqueue(PendingAction(changeId = changeId, path = path, bodyJson = bodyJson, label = label))
        queued()
    }

/** True when [this] means "no connection", not "the platform said no". */
fun Throwable.isOffline(): Boolean =
    (this is AppException && error == AppError.Network) || this is IOException || this is UnresolvedAddressException

/**
 * One `changeId` per driver action, not per tap (backlog C1). The same action asked for again - a
 * second tap, a retry after a timeout - reuses its id, so the platform and the queue both see one
 * write. [settled] forgets it once the action has a final answer, so a genuinely new attempt (a
 * second failed delivery, say) gets a new id.
 */
class ActionIds(private val newId: () -> String) {
    private val ids = mutableMapOf<String, String>()

    fun of(action: String): String = ids.getOrPut(action) { newId() }

    fun settled(action: String) {
        ids.remove(action)
    }
}
