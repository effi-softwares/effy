package com.effyshopping.driver.mobile.core.offline

import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException

/**
 * Wrap a driver mutation so a **network failure never loses the write** (049 US6, FR-039/040).
 *
 * Runs [block] (the online POST). If it fails because the network is down, the action is enqueued for
 * replay (idempotent by `changeId` — a duplicate on reconnect is a no-op) and the original
 * `AppError.Network` is re-thrown so the UI can say "you're offline, we'll retry". Any other failure
 * (a real refusal) propagates unchanged and is NOT queued.
 */
suspend inline fun <T> OfflineQueue.withReplay(
    path: String,
    bodyJson: String,
    changeId: String,
    label: String,
    block: () -> T,
): T =
    try {
        block()
    } catch (e: AppException) {
        if (e.error == AppError.Network) {
            enqueue(PendingAction(changeId = changeId, path = path, bodyJson = bodyJson, label = label))
        }
        throw e
    }
