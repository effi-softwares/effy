package com.effyshopping.driver.mobile.features.inbox.domain

import com.effyshopping.driver.mobile.core.push.DriverDestination

/**
 * The driver's notification inbox (110 US3): every notification about their work, whether or not a push reached the
 * phone. All / Unread only - drivers have no category filter. `ViewModel → UseCase → Repository`.
 */
data class InboxItem(
    val id: String,
    val type: String,
    val category: String,
    val important: Boolean,
    val title: String,
    val body: String,
    /** Where a tap leads; null when this build does not know it - the item then opens its detail sheet. */
    val destination: DriverDestination?,
    /** ISO 8601 with microseconds, exactly as sent: the "seen up to" cut-off is built from it. */
    val createdAt: String,
    val read: Boolean,
    /** A message's picture (112): shown when it is opened. */
    val imageUrl: String? = null,
) {
    /** A message from Effy (112): read in its sheet, with its picture, before going anywhere. */
    val isMessage: Boolean get() = type == "driver_message"

    /** Messages, and anything with no destination this build knows, open their sheet; the rest go where they lead. */
    val opensDetail: Boolean get() = destination == null || isMessage
}

data class InboxPage(val pinned: List<InboxItem>, val items: List<InboxItem>, val nextCursor: String?, val unseenCount: Int)

interface InboxRepository {
    suspend fun page(unreadOnly: Boolean, cursor: String?): InboxPage
    suspend fun unseenCount(): Int
    suspend fun markSeen(before: String): Int
    suspend fun readAll(before: String): Int
    /** Archive or undo. Already gone counts as done. */
    suspend fun setArchived(id: String, archived: Boolean)
    /** The tap (109's route). Failures are swallowed - the screen still opens. */
    suspend fun markRead(id: String)
}

class InboxActions(private val repo: InboxRepository) {
    suspend fun page(unreadOnly: Boolean, cursor: String? = null) = repo.page(unreadOnly, cursor)
    suspend fun unseenCount() = repo.unseenCount()
    suspend fun markSeen(before: String) = repo.markSeen(before)
    suspend fun readAll(before: String) = repo.readAll(before)
    suspend fun archive(id: String) = repo.setArchived(id, true)
    suspend fun restore(id: String) = repo.setArchived(id, false)
    suspend fun markRead(id: String) = repo.markRead(id)
}

/** A day heading and the items under it, newest first. */
data class InboxGroup(val heading: String, val items: List<InboxItem>)

/** Today / Yesterday / Earlier, by the day each item arrived. [dayOf] is a parameter so the test needs no clock. */
fun groupByDay(items: List<InboxItem>, today: String, yesterday: String, dayOf: (String) -> String?): List<InboxGroup> {
    val by = linkedMapOf<String, MutableList<InboxItem>>()
    for (item in items) {
        val heading = when (dayOf(item.createdAt)) {
            today -> "Today"
            yesterday -> "Yesterday"
            else -> "Earlier"
        }
        by.getOrPut(heading) { mutableListOf() }.add(item)
    }
    return listOf("Today", "Yesterday", "Earlier").mapNotNull { h -> by[h]?.let { InboxGroup(h, it) } }
}
