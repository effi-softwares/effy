package com.effyshopping.driver.mobile.core.offline

import com.russhwolf.settings.Settings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/**
 * A device-local, persisted FIFO of driver writes awaiting replay (049 US6, FR-039/040). Survives
 * process death (multiplatform-settings = SharedPreferences / NSUserDefaults). Deduplicated by
 * `changeId` so the same action is never queued twice.
 *
 * ⚠ This holds only status-advance actions — small, low-frequency, and idempotent by `changeId`. It is
 * NOT a general write-behind cache.
 */
class OfflineQueue(private val settings: Settings, private val json: Json = Json { ignoreUnknownKeys = true }) {

    // ⚠ Declared BEFORE _pending: _pending's initializer calls load(), which uses this. If it were
    // declared later it would still be null during that initializer and every load would decode to empty.
    private val listSerializer = ListSerializer(PendingAction.serializer())

    private val _pending = MutableStateFlow(load())
    val pending: StateFlow<List<PendingAction>> = _pending.asStateFlow()

    val count: Int get() = _pending.value.size

    fun enqueue(action: PendingAction) {
        val cur = _pending.value
        if (cur.any { it.changeId == action.changeId }) return // already queued (idempotent enqueue)
        persist(cur + action)
    }

    /** The oldest pending action, or null. */
    fun peek(): PendingAction? = _pending.value.firstOrNull()

    /** Remove an action once it has been applied (or dead-lettered). */
    fun remove(changeId: String) {
        persist(_pending.value.filterNot { it.changeId == changeId })
    }

    /** Record a failed replay attempt (backoff/dead-letter bookkeeping). */
    fun bumpAttempts(changeId: String) {
        persist(_pending.value.map { if (it.changeId == changeId) it.copy(attempts = it.attempts + 1) else it })
    }

    private fun persist(list: List<PendingAction>) {
        settings.putString(KEY, json.encodeToString(listSerializer, list))
        _pending.value = list
    }

    private fun load(): List<PendingAction> {
        val raw = settings.getStringOrNull(KEY) ?: return emptyList()
        return runCatching { json.decodeFromString(listSerializer, raw) }.getOrDefault(emptyList())
    }

    private companion object {
        const val KEY = "driver.offline.queue.v1"
    }
}
