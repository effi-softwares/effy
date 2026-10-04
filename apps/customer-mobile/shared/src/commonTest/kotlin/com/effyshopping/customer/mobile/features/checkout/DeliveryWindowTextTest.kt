package com.effyshopping.customer.mobile.features.checkout

import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryWindowText
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * 069 — this app says when an order arrives in the SAME WORDS as the web page and the emailed receipt.
 *
 * ⚠ The fixture is the one `packages/shared-types` tests `formatArrival` against (see
 * [DELIVERY_WINDOW_FIXTURE] for why it is a copy, and what keeps the copy honest). A case that passes
 * there and fails here is the defect this exists to catch.
 */
class DeliveryWindowTextTest {

    private val fixture = Json.parseToJsonElement(DELIVERY_WINDOW_FIXTURE).jsonObject

    private fun JsonObject.str(key: String): String? =
        this[key]?.takeIf { it !is JsonNull }?.jsonPrimitive?.content

    private fun ms(iso: String): Long = assertNotNull(DeliveryWindowText.epochMillisOrNull(iso), iso)

    @Test
    fun `every arrival case in the shared fixture reads the same here`() {
        val cases = fixture.getValue("arrival").jsonArray
        assertTrue(cases.size > 10, "a fixture that loads empty proves nothing")

        for (case in cases) {
            val c = case.jsonObject
            val input = c.getValue("input").jsonObject
            val got = DeliveryWindowText.formatArrival(
                promisedFrom = input.str("promisedFrom"),
                promisedTo = input.str("promisedTo"),
                windowStart = input.str("windowStart"),
                windowEnd = input.str("windowEnd"),
                nowEpochMillis = ms(c.str("now")!!),
            )
            assertEquals(c.str("expect"), got, c.str("name"))
        }
    }

    // ⚠ The arithmetic, proven with a FIXED offset so it does not lean on the host's timezone database.

    private val aedt: (Long) -> Int = { 11 * 3600 }

    @Test
    fun `a window given as UTC instants is said in Melbourne time`() {
        val got = DeliveryWindowText.formatWindow(ms("2026-10-08T06:00:00Z"), ms("2026-10-08T08:30:00Z"), aedt)
        assertEquals("5 pm – 7:30 pm", got)
    }

    @Test
    fun `noon and midnight are 12 pm and 12 am`() {
        assertEquals("12 pm – 12 am", DeliveryWindowText.formatWindow(ms("2026-10-08T12:00:00+11:00"), ms("2026-10-09T00:00:00+11:00"), aedt))
        assertEquals("11 am – 1 pm", DeliveryWindowText.formatWindow(ms("2026-10-08T11:00:00+11:00"), ms("2026-10-08T13:00:00+11:00"), aedt))
    }

    @Test
    fun `the Melbourne day is the day there - not the day in UTC`() {
        // 22:00 UTC on the 7th is 09:00 on the 8th in Melbourne.
        assertEquals("2026-10-08", DeliveryWindowText.melbourneDay(ms("2026-10-07T22:00:00Z"), aedt))
    }

    @Test
    fun `a day is formatted without a timezone - across a month and a leap day`() {
        assertEquals("Thu 8 Oct", DeliveryWindowText.formatDay("2026-10-08"))
        assertEquals("Sun 1 Nov", DeliveryWindowText.formatDay("2026-11-01"))
        assertEquals("Tue 29 Feb", DeliveryWindowText.formatDay("2028-02-29"))
        assertEquals("Fri 1 Jan", DeliveryWindowText.formatDay("2027-01-01"))
    }

    @Test
    fun `a value that is not a real date is returned unchanged - never reinterpreted`() {
        assertEquals("2026-02-30", DeliveryWindowText.formatDay("2026-02-30"))
        assertEquals("soon", DeliveryWindowText.formatDay("soon"))
    }

    @Test
    fun `today and tomorrow are relative to the day given`() {
        assertEquals("Today", DeliveryWindowText.relativeDay("2026-10-08", "2026-10-08"))
        assertEquals("Tomorrow", DeliveryWindowText.relativeDay("2026-10-09", "2026-10-08"))
        assertEquals("Sat 10 Oct", DeliveryWindowText.relativeDay("2026-10-10", "2026-10-08"))
        assertEquals("Wed 7 Oct", DeliveryWindowText.relativeDay("2026-10-07", "2026-10-08"))
    }

    @Test
    fun `half a window is not a promise`() {
        val got = DeliveryWindowText.formatArrival(
            promisedFrom = "2026-10-08", promisedTo = "2026-10-08",
            windowStart = "2026-10-08T17:00:00+11:00", windowEnd = null,
            nowEpochMillis = ms("2026-10-08T09:00:00+11:00"), offsetAt = aedt,
        )
        assertEquals("Today", got)
    }

    @Test
    fun `an unreadable instant is null - never a guess`() {
        assertNull(DeliveryWindowText.epochMillisOrNull("five o'clock"))
        assertNull(DeliveryWindowText.formatWindow("nope", "2026-10-08T08:00:00Z"))
    }
}
