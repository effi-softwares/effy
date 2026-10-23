package com.effyshopping.driver.mobile.core.offline

import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException

/**
 * The last successful read of something, served when the device has no connection (a loading dock with no
 * signal), as [OfflineQueue] carries writes. Only [AppError.Network] falls back: a 404 or 403 means it is no
 * longer the driver's to see. In memory only, and never consulted while a fetch can succeed.
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
