package com.effyshopping.driver.mobile.features.delivery

import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryWindow
import com.effyshopping.driver.mobile.features.delivery.domain.DropStatus
import com.effyshopping.driver.mobile.features.delivery.domain.WindowState
import com.effyshopping.driver.mobile.features.delivery.domain.windowNote
import com.effyshopping.driver.mobile.features.delivery.domain.windowStateAt
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

/**
 * 069 US4 — the driver is told whether a drop's window is open, still to come, or missed.
 *
 * ⚠ The state cases are the SAME ones `packages/shared-types` tests `windowStateAt` with — the
 * function the dispatcher's console uses (see [DELIVERY_WINDOW_FIXTURE] for why it is a copy and what
 * keeps the copy honest). A dispatcher told a drop is late while the driver's app says it is due is
 * two people working from different facts.
 */
@OptIn(ExperimentalTime::class)
class DeliveryWindowTest {

    private val fixture = Json.parseToJsonElement(DELIVERY_WINDOW_FIXTURE).jsonObject

    private fun ms(iso: String) = Instant.parse(iso).toEpochMilliseconds()

    private val window: DeliveryWindow = run {
        val w = fixture.getValue("stateWindow").jsonObject
        assertNotNull(
            DeliveryWindow.of(
                "5 pm – 7 pm",
                w.getValue("startAt").jsonPrimitive.content,
                w.getValue("endAt").jsonPrimitive.content,
            ),
        )
    }

    @Test
    fun `every state case in the shared fixture reads the same here`() {
        val cases = fixture.getValue("state").jsonArray
        assertTrue(cases.size >= 5, "a fixture that loads empty proves nothing")
        val words = mapOf("upcoming" to WindowState.Upcoming, "due" to WindowState.Due, "late" to WindowState.Late)

        for (case in cases) {
            val c = case.jsonObject
            val name = c.getValue("name").jsonPrimitive.content
            val expected = assertNotNull(words[c.getValue("expect").jsonPrimitive.content], name)
            assertEquals(expected, windowStateAt(ms(c.getValue("now").jsonPrimitive.content), window), name)
        }
    }

    @Test
    fun `each state has a word - and before the window opens there is nothing to say`() {
        assertEquals("", WindowState.Upcoming.word)
        assertEquals("Due now", WindowState.Due.word)
        assertEquals("Late", WindowState.Late.word)
    }

    // ── From the wire ───────────────────────────────────────────────────────────────────────────────

    @Test
    fun `a window is built from the server's label and its two instants`() {
        val w = assertNotNull(DeliveryWindow.of("5 pm – 7 pm", "2026-10-08T06:00:00.000Z", "2026-10-08T08:00:00.000Z"))
        // The label is the SERVER's, in Melbourne time. This app formats no time of its own.
        assertEquals("5 pm – 7 pm", w.label)
        assertEquals(ms("2026-10-08T17:00:00+11:00"), w.startEpochMillis)
        assertEquals(ms("2026-10-08T19:00:00+11:00"), w.endEpochMillis)
    }

    @Test
    fun `half a window is not a window - an order placed before 069 has none`() {
        assertNull(DeliveryWindow.of(null, null, null))
        assertNull(DeliveryWindow.of("5 pm – 7 pm", null, "2026-10-08T08:00:00Z"))
        assertNull(DeliveryWindow.of("5 pm – 7 pm", "2026-10-08T06:00:00Z", null))
        assertNull(DeliveryWindow.of(null, "2026-10-08T06:00:00Z", "2026-10-08T08:00:00Z"))
        assertNull(DeliveryWindow.of("  ", "2026-10-08T06:00:00Z", "2026-10-08T08:00:00Z"))
    }

    @Test
    fun `an instant that cannot be read is no window - never a guess`() {
        assertNull(DeliveryWindow.of("5 pm – 7 pm", "five o'clock", "2026-10-08T08:00:00Z"))
    }

    // ── What the screen says ────────────────────────────────────────────────────────────────────────

    @Test
    fun `a drop still to be done is judged against the clock`() {
        val late = ms("2026-10-08T20:00:00+11:00")
        for (status in listOf(DropStatus.STAGED, DropStatus.OUT_FOR_DELIVERY, DropStatus.EN_ROUTE, DropStatus.ARRIVED)) {
            assertEquals("5 pm – 7 pm" to WindowState.Late, windowNote(window, status, late), status.name)
        }
        assertEquals(WindowState.Due, windowNote(window, DropStatus.EN_ROUTE, ms("2026-10-08T18:00:00+11:00"))?.second)
    }

    @Test
    fun `a finished drop is never called late here`() {
        val long = ms("2026-10-08T23:00:00+11:00")
        assertEquals("5 pm – 7 pm" to WindowState.Upcoming, windowNote(window, DropStatus.DELIVERED, long))
        assertEquals(WindowState.Upcoming, windowNote(window, DropStatus.FAILED, long)?.second)
    }

    @Test
    fun `a drop with no window says nothing at all`() {
        assertNull(windowNote(null, DropStatus.EN_ROUTE, 0))
    }
}
