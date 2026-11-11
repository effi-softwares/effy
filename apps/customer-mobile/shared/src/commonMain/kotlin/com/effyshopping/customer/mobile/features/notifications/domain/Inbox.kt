package com.effyshopping.customer.mobile.features.notifications.domain

import com.effyshopping.customer.mobile.core.push.CustomerDestination

/**
 * The shopper's notification inbox (110): everything Effy told them, whether or not a push reached them.
 * `ViewModel → UseCase → Repository` (Principle VI); the DTOs stay in the data layer.
 */
data class InboxItem(
    val id: String,
    val type: String,
    val category: String,
    val important: Boolean,
    val title: String,
    val body: String,
    /** Where a tap leads; null when this build does not know it - the item then opens its detail sheet (FR-013). */
    val destination: CustomerDestination?,
    /** ISO 8601 with microseconds, exactly as the server sent it: the "seen up to" cut-off is built from it. */
    val createdAt: String,
    val read: Boolean,
    /** "Ends Sun" for offers, news and important notices with an end; otherwise null. */
    val endsLabel: String?,
    /** A message's picture (112): shown when it is opened. */
    val imageUrl: String? = null,
) {
    /** A message from Effy's team (112): read in its sheet, with its picture, before going anywhere. */
    val isMessage: Boolean get() = type == "customer_message"

    /** Offers and news (111) and messages (112) open their sheet first; everything else goes where it leads. */
    val opensDetail: Boolean get() = destination == null || isMessage || category == "offers" || category == "news"
}

data class InboxPage(
    val pinned: List<InboxItem>,
    val items: List<InboxItem>,
    val nextCursor: String?,
    /** First page only: the categories the shopper has items in (the chips offered). */
    val categories: List<String>?,
    val unseenCount: Int,
)

enum class InboxFilter(val wire: String) { ALL("all"), UNREAD("unread") }

interface InboxRepository {
    /** One page. A failure throws an `AppException`: "no notifications" and "we could not ask" differ. */
    suspend fun page(filter: InboxFilter, category: String?, cursor: String?): InboxPage
    suspend fun unseenCount(): Int
    /** Opening the inbox: everything up to [before] is seen. Returns the count after. */
    suspend fun markSeen(before: String): Int
    suspend fun readAll(before: String): Int
    /** Archive or undo. An item that is gone (another device, retention) counts as done. */
    suspend fun setArchived(id: String, archived: Boolean)
    /** The tap: recorded read (109's route). Failures are swallowed - the screen still opens. */
    suspend fun markRead(id: String)
}

/** The inbox's use cases, one object so the ViewModel names its one dependency. */
class InboxActions(private val repo: InboxRepository) {
    suspend fun page(filter: InboxFilter, category: String?, cursor: String? = null) = repo.page(filter, category, cursor)
    suspend fun unseenCount() = repo.unseenCount()
    suspend fun markSeen(before: String) = repo.markSeen(before)
    suspend fun readAll(before: String) = repo.readAll(before)
    suspend fun archive(id: String) = repo.setArchived(id, true)
    suspend fun restore(id: String) = repo.setArchived(id, false)
    suspend fun markRead(id: String) = repo.markRead(id)
}
