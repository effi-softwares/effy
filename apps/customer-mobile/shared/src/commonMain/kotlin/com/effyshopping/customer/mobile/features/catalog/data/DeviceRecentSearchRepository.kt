package com.effyshopping.customer.mobile.features.catalog.data

import com.effyshopping.customer.mobile.core.storage.DevicePreferences
import com.effyshopping.customer.mobile.core.storage.PreferenceKeys
import com.effyshopping.customer.mobile.features.catalog.domain.RecentSearch
import com.effyshopping.customer.mobile.features.catalog.domain.RecentSearchRepository
import com.effyshopping.customer.mobile.features.catalog.domain.withRecentSearch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/**
 * Recent searches on THIS device (087 FR-036), in [DevicePreferences] under one key.
 *
 * ⚠ A preference, not a record: unreadable data is treated as "no recent searches" rather than an
 * error, and sign-out clears it (`clearGuestData`) so the next person on a shared phone does not see
 * what the last one looked for.
 */
class DeviceRecentSearchRepository(private val prefs: DevicePreferences) : RecentSearchRepository {

    @Serializable
    private data class Stored(val text: String, val at: Long)

    private val json = Json { ignoreUnknownKeys = true }
    private val serializer = ListSerializer(Stored.serializer())

    private val _searches = MutableStateFlow(read())
    override val searches: StateFlow<List<RecentSearch>> = _searches.asStateFlow()

    override fun record(text: String, at: Long) = write(withRecentSearch(_searches.value, text, at))

    override fun remove(text: String) = write(_searches.value.filterNot { it.text.equals(text, ignoreCase = true) })

    override fun clear() {
        prefs.remove(PreferenceKeys.RECENT_SEARCHES)
        _searches.value = emptyList()
    }

    /** Re-read after something else cleared the store (sign-out). */
    fun reload() {
        _searches.value = read()
    }

    private fun read(): List<RecentSearch> = runCatching {
        prefs.getString(PreferenceKeys.RECENT_SEARCHES)?.let { raw ->
            json.decodeFromString(serializer, raw).map { RecentSearch(it.text, it.at) }
        }
    }.getOrNull().orEmpty()

    private fun write(list: List<RecentSearch>) {
        _searches.value = list
        prefs.putString(PreferenceKeys.RECENT_SEARCHES, json.encodeToString(serializer, list.map { Stored(it.text, it.at) }))
    }
}
