package com.effyshopping.driver.mobile.features.activity.domain

/** In-app activity feed (049 US6). */

data class ActivityItem(
    val id: String,
    val type: String,
    val body: String,
    val createdAt: String,
    val read: Boolean,
    val runId: String?,
    val dropId: String?,
)

interface ActivityRepository {
    suspend fun list(): List<ActivityItem>
    suspend fun markRead(ids: List<String>)
}

/**
 * How far down the feed this driver has read, kept ON THE PHONE.
 *
 * ⚠ The platform has nowhere to record a read receipt — every item arrives `read = false`, always.
 * So "new" is judged here, against the newest item the driver has already been shown.
 */
interface ActivitySeen {
    /** `createdAt` of the newest item already shown; null when the feed has never been opened. */
    fun lastSeen(): String?
    fun markSeen(createdAt: String)
}

/** New since the driver last opened the feed. ISO instants in one format compare as text. */
fun ActivityItem.isNewSince(lastSeen: String?): Boolean = lastSeen == null || createdAt > lastSeen

/** How many items are new — the number beside "Activity" on Today. */
class CountNewActivity(private val repo: ActivityRepository, private val seen: ActivitySeen) {
    suspend operator fun invoke(): Int {
        val lastSeen = seen.lastSeen()
        return repo.list().count { it.isNewSince(lastSeen) }
    }
}

class GetActivity(private val repo: ActivityRepository) {
    suspend operator fun invoke() = repo.list()
}
class MarkActivityRead(private val repo: ActivityRepository) {
    suspend operator fun invoke(ids: List<String>) = repo.markRead(ids)
}
