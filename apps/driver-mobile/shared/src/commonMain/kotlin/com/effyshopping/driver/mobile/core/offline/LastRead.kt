package com.effyshopping.driver.mobile.core.offline

import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException

/**
 * The last successful READ of something, served when the device has no connection (065 FR-024).
 *
 * A driver opens a stop on arrival, usually with signal, and reads it again at the counter or in a
 * loading dock where there is none. [OfflineQueue] beside this file carries WRITES across a dropout;
 * nothing carried reads, so reopening a screen offline showed an error over a list the driver had
 * been looking at a minute earlier.
 *
 * ⚠ ONLY [AppError.Network] FALLS BACK. A 404 or a 403 is the platform saying this is no longer the
 * driver's to see — a reassigned stop, a signed-out session — and answering that with a remembered
 * copy would contradict it. ⚠ In memory, for the life of the app: this is not an offline-first cache,
 * and it is never consulted while a fetch can succeed.
 */
class LastRead<K, V>(private val markStale: (V) -> V) {
    private val seen = mutableMapOf<K, V>()

    suspend fun fetch(key: K, load: suspend () -> V): V =
        try {
            load().also { seen[key] = it }
        } catch (e: AppException) {
            if (e.error != AppError.Network) throw e
            seen[key]?.let(markStale) ?: throw e
        }
}
