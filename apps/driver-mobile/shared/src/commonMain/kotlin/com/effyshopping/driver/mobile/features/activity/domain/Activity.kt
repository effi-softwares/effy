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

class GetActivity(private val repo: ActivityRepository) {
    suspend operator fun invoke() = repo.list()
}
class MarkActivityRead(private val repo: ActivityRepository) {
    suspend operator fun invoke(ids: List<String>) = repo.markRead(ids)
}
