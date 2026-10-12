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

    private val _pending = MutableStateFlow(load(KEY))
    val pending: StateFlow<List<PendingAction>> = _pending.asStateFlow()

    val count: Int get() = _pending.value.size

    /**
     * Writes the platform REFUSED when they were finally sent, kept until the driver has been told.
     * ⚠ These were removed without a word: a collect made in a loading dock could be refused an hour
     * later and the driver never learned the stop was not recorded.
     */
    private val _refused = MutableStateFlow(load(REFUSED_KEY))
    val refused: StateFlow<List<PendingAction>> = _refused.asStateFlow()

    fun enqueue(action: PendingAction) {
        val cur = _pending.value
        if (cur.any { it.changeId == action.changeId }) return // already queued (idempotent enqueue)
        persist(cur + action)
    }

    /** The oldest pending action, or null. */
    fun peek(): PendingAction? = _pending.value.firstOrNull()

    /** Remove an action once it has been applied. */
    fun remove(changeId: String) {
        persist(_pending.value.filterNot { it.changeId == changeId })
    }

    /** Record a failed replay attempt (backoff/dead-letter bookkeeping). */
    fun bumpAttempts(changeId: String) {
        persist(_pending.value.map { if (it.changeId == changeId) it.copy(attempts = it.attempts + 1) else it })
    }

    /** The platform said no and trying again cannot help: stop sending it, and keep it to show. */
    fun refuse(changeId: String) {
        val action = _pending.value.firstOrNull { it.changeId == changeId } ?: return
        remove(changeId)
        val list = _refused.value + action
        settings.putString(REFUSED_KEY, json.encodeToString(listSerializer, list))
        _refused.value = list
    }

    /** The driver has read what was refused. */
    fun clearRefused() {
        settings.remove(REFUSED_KEY)
        _refused.value = emptyList()
    }

    private fun persist(list: List<PendingAction>) {
        settings.putString(KEY, json.encodeToString(listSerializer, list))
        _pending.value = list
    }

    private fun load(key: String): List<PendingAction> {
        val raw = settings.getStringOrNull(key) ?: return emptyList()
        return runCatching { json.decodeFromString(listSerializer, raw) }.getOrDefault(emptyList())
    }

    private companion object {
        const val KEY = "driver.offline.queue.v1"
        const val REFUSED_KEY = "driver.offline.refused.v1"
    }
}
