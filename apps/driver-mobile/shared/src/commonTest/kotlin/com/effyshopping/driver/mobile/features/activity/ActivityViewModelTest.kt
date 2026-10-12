package com.effyshopping.driver.mobile.features.activity

import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.features.activity.domain.ActivityItem
import com.effyshopping.driver.mobile.features.activity.domain.ActivityRepository
import com.effyshopping.driver.mobile.features.activity.domain.GetActivity
import com.effyshopping.driver.mobile.features.activity.domain.MarkActivityRead
import com.effyshopping.driver.mobile.features.activity.presentation.ActivityViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.BeforeTest
import kotlin.test.Test
import com.effyshopping.driver.mobile.features.activity.data.SettingsActivitySeen
import com.effyshopping.driver.mobile.features.activity.domain.CountNewActivity
import com.russhwolf.settings.MapSettings
import kotlin.test.assertEquals
import kotlin.test.assertTrue

private class FakeActivityRepo(var items: List<ActivityItem> = emptyList(), var fail: AppError? = null) : ActivityRepository {
    var markedRead: List<String>? = null
    override suspend fun list(): List<ActivityItem> = fail?.let { throw AppException(it) } ?: items
    override suspend fun markRead(ids: List<String>) { markedRead = ids }
}

class ActivityViewModelTest {
    @BeforeTest fun setup() { Dispatchers.setMain(Dispatchers.Unconfined) }

    private fun vm(repo: FakeActivityRepo) = ActivityViewModel(GetActivity(repo), MarkActivityRead(repo))

    @Test fun loads_items_and_marks_unread_ones_read() = runTest {
        val repo = FakeActivityRepo(items = listOf(
            ActivityItem("a", "run_assigned", "New run", "2026-08-23T09:00", read = false, runId = "r1", dropId = null),
            ActivityItem("b", "reminder", "Reminder", "2026-08-23T08:00", read = true, runId = null, dropId = null),
        ))
        val v = vm(repo); v.load()
        assertEquals(2, v.state.value.items.size)
        assertEquals(listOf("a"), repo.markedRead) // only the unread one
    }

    @Test fun an_empty_feed_is_a_distinct_state() = runTest {
        val v = vm(FakeActivityRepo(items = emptyList())); v.load()
        assertTrue(v.state.value.isEmpty)
    }

    @Test fun a_network_error_surfaces_a_message() = runTest {
        val v = vm(FakeActivityRepo(fail = AppError.Network)); v.load()
        assertTrue(v.state.value.message != null)
    }

    /** The platform sends every item as unread, always: what is new is judged on the phone. */
    @Test fun only_items_newer_than_the_last_visit_are_new() = runTest {
        val seen = SettingsActivitySeen(MapSettings())
        val repo = FakeActivityRepo(items = listOf(
            ActivityItem("a", "run_assigned", "First", "2026-08-23T08:00:00.000Z", read = false, runId = "r1", dropId = null),
        ))
        val count = CountNewActivity(repo, seen)
        assertEquals(1, count())

        ActivityViewModel(GetActivity(repo), MarkActivityRead(repo), seen).load() // the driver opens the feed
        assertEquals(0, count())

        repo.items = repo.items + ActivityItem("b", "run_assigned", "Second", "2026-08-23T09:00:00.000Z", read = false, runId = "r2", dropId = null)
        assertEquals(1, count())
        val v = ActivityViewModel(GetActivity(repo), MarkActivityRead(repo), seen); v.load()
        assertEquals(listOf(true, false), v.state.value.items.map { it.read }) // a = read, b = new
    }
}
