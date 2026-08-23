package com.effyshopping.driver.mobile.core.offline

import com.russhwolf.settings.MapSettings
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class OfflineQueueTest {

    private fun action(id: String, path: String = "driver/v1/x") =
        PendingAction(changeId = id, path = path, bodyJson = """{"changeId":"$id"}""", label = "x")

    @Test
    fun enqueue_is_deduplicated_by_changeId() {
        val q = OfflineQueue(MapSettings())
        q.enqueue(action("a"))
        q.enqueue(action("a")) // same changeId — must not queue twice
        q.enqueue(action("b"))
        assertEquals(2, q.count)
    }

    @Test
    fun peek_is_fifo_and_remove_advances() {
        val q = OfflineQueue(MapSettings())
        q.enqueue(action("first"))
        q.enqueue(action("second"))
        assertEquals("first", q.peek()?.changeId)
        q.remove("first")
        assertEquals("second", q.peek()?.changeId)
        q.remove("second")
        assertNull(q.peek())
    }

    @Test
    fun a_persisted_queue_is_loaded_on_construction() {
        // Simulate a prior run having persisted a pending action; a fresh queue must load it (FR-040).
        val settings = MapSettings()
        settings.putString(
            "driver.offline.queue.v1",
            """[{"changeId":"keep","path":"driver/v1/x","bodyJson":"{}","label":"x","attempts":0}]""",
        )
        val reloaded = OfflineQueue(settings)
        assertEquals(1, reloaded.count)
        assertEquals("keep", reloaded.peek()?.changeId)
    }

    @Test
    fun bumpAttempts_increments_the_named_action_only() {
        val q = OfflineQueue(MapSettings())
        q.enqueue(action("a"))
        q.enqueue(action("b"))
        q.bumpAttempts("a")
        q.bumpAttempts("a")
        assertEquals(2, q.pending.value.first { it.changeId == "a" }.attempts)
        assertEquals(0, q.pending.value.first { it.changeId == "b" }.attempts)
    }

    @Test
    fun a_corrupt_stored_value_loads_as_empty_rather_than_crashing() {
        val settings = MapSettings()
        settings.putString("driver.offline.queue.v1", "not json at all {[")
        assertTrue(OfflineQueue(settings).pending.value.isEmpty())
    }
}
