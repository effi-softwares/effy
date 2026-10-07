package com.effyshopping.driver.mobile.core.opening

import com.effyshopping.driver.mobile.contract.ProblemFieldIssue
import com.effyshopping.driver.mobile.contract.ProblemJSON
import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.http.appErrorFor
import com.effyshopping.driver.mobile.core.presentation.userMessage
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * 072 — a round is on the phone hours before it can be worked.
 *
 * These pin the three things the app does about that: it knows when a round opens, it notices the
 * moment arrive, and when the platform refuses an early action it says WHEN rather than something
 * generic.
 */
class OpeningTest {
    // 2026-10-08T05:15:00Z — 4:15 pm in Melbourne (AEDT).
    private val at = "2026-10-08T05:15:00.000Z"
    private val atMillis = 1_791_436_500_000L

    @Test fun reads_an_opening_from_the_wire() {
        val opening = Opening.of(at, "4:15 pm")
        assertEquals(Opening(atMillis, "4:15 pm"), opening)
        assertEquals("Opens 4:15 pm", opening!!.sentence)
    }

    /** Half an opening cannot be shown or cannot ever unlock — so the round is treated as open. */
    @Test fun half_an_opening_is_no_opening() {
        assertNull(Opening.of(at, null))
        assertNull(Opening.of(at, "  "))
        assertNull(Opening.of(null, "4:15 pm"))
        assertNull(Opening.of("not a time", "4:15 pm"))
    }

    @Test fun is_closed_until_the_moment_and_open_from_it() {
        val opening = Opening.of(at, "4:15 pm")!!
        assertFalse(opening.isOpenAt(atMillis - 1))
        assertTrue(opening.isOpenAt(atMillis))
        assertTrue(opening.isOpenAt(atMillis + 60_000))
    }

    /**
     * ⚠ THE SERVER SENDS NOTHING ONCE A ROUND IS OPEN, so null must mean open — whatever this
     * device's clock says. A phone an hour slow must not lock a round the platform has opened.
     */
    @Test fun no_opening_means_open_whatever_the_clock_says() {
        val none: Opening? = null
        assertTrue(none.isOpenAt(0))
        assertTrue(none.isOpenAt(Long.MAX_VALUE))
    }

    // ── The refusal ─────────────────────────────────────────────────────────────────────────────

    private fun problem(type: String, vararg issues: Pair<String, String>) = ProblemJSON(
        status = 409.0,
        title = "Not open yet",
        type = type,
        errors = issues.map { ProblemFieldIssue(field = it.first, message = it.second) },
    )

    @Test fun a_not_open_refusal_carries_when_it_opens() {
        val error = appErrorFor(409, problem("round_not_open", "opensAt" to at, "opensLabel" to "4:15 pm"))
        assertIs<AppError.NotOpenYet>(error)
        assertEquals(Opening(atMillis, "4:15 pm"), error.opening)
        assertEquals("This round isn't open yet. Opens 4:15 pm.", error.userMessage())
    }

    /**
     * ⚠ NOT A CONFLICT. Both are a 409, and a conflict tells the driver "someone else just changed
     * this. Pull to refresh" — which they could do for hours at a round that is simply not open.
     */
    @Test fun it_is_never_reported_as_someone_else_changed_this() {
        val notOpen = appErrorFor(409, problem("round_not_open", "opensAt" to at, "opensLabel" to "4:15 pm"))
        assertFalse(notOpen.userMessage().contains("Pull to refresh"))
        assertEquals(AppError.Conflict, appErrorFor(409, problem("stale")))
        assertEquals(AppError.Conflict, appErrorFor(409, null))
    }

    @Test fun a_refusal_that_cannot_be_read_still_says_not_yet() {
        val error = appErrorFor(409, problem("round_not_open"))
        assertIs<AppError.NotOpenYet>(error)
        assertNull(error.opening)
        assertEquals("This round isn't open yet.", error.userMessage())
    }

    @Test fun the_other_statuses_map_as_they_always_have() {
        assertEquals(AppError.Unauthenticated, appErrorFor(401, null))
        assertEquals(AppError.Forbidden, appErrorFor(403, null))
        assertEquals(AppError.NotFound, appErrorFor(404, null))
        assertEquals(AppError.Unavailable, appErrorFor(503, null))
        assertEquals(AppError.Unexpected, appErrorFor(418, null))
    }
}
