package com.effyshopping.customer.mobile.features.catalog.domain

import kotlinx.coroutines.flow.StateFlow

/**
 * A search the shopper ran. Device-only: never sent to a server, never in analytics.
 */
data class RecentSearch(val text: String, val at: Long)

/** The device's recent searches, newest first, at most [RECENT_SEARCH_LIMIT]. */
interface RecentSearchRepository {
    val searches: StateFlow<List<RecentSearch>>
    fun record(text: String, at: Long)
    fun remove(text: String)
    fun clear()
}

const val RECENT_SEARCH_LIMIT = 10
const val RECENT_SEARCH_MAX_LENGTH = 100

/**
 * The rule for adding one, pure so it is testable: trimmed, blank ignored, the same text (ignoring
 * case) moves to the top rather than appearing twice, and the oldest falls off past the limit.
 */
fun withRecentSearch(current: List<RecentSearch>, text: String, at: Long): List<RecentSearch> {
    val t = text.trim().take(RECENT_SEARCH_MAX_LENGTH)
    if (t.isEmpty()) return current
    return (listOf(RecentSearch(t, at)) + current.filterNot { it.text.equals(t, ignoreCase = true) })
        .take(RECENT_SEARCH_LIMIT)
}

class RecordSearch(private val repo: RecentSearchRepository) {
    operator fun invoke(text: String, at: Long) = repo.record(text, at)
}

class RemoveRecentSearch(private val repo: RecentSearchRepository) {
    operator fun invoke(text: String) = repo.remove(text)
}

class ClearRecentSearches(private val repo: RecentSearchRepository) {
    operator fun invoke() = repo.clear()
}
