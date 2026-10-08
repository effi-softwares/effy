package com.effyshopping.customer.mobile.features.checkout

import com.effyshopping.customer.mobile.commerce.contract.EffyWindowsDTO
import com.effyshopping.customer.mobile.features.checkout.data.toDomain
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryWindowText
import com.effyshopping.customer.mobile.features.checkout.presentation.EffyDayView
import com.effyshopping.customer.mobile.features.checkout.presentation.EffyWindowLine
import com.effyshopping.customer.mobile.features.checkout.presentation.EffyWindowsView
import com.effyshopping.customer.mobile.features.checkout.presentation.effyWindowsView
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * 078 — this app's delivery-window picker says exactly what the website's says (P17, P18).
 *
 * ⚠ The fixture is the one `packages/shared-types` tests `effyWindowsView` against, and the website's
 * picker is drawn from (see [EFFY_WINDOWS_FIXTURE] for why it is a copy and what keeps it honest).
 * Each case's `input` is decoded as the SERVER'S BYTES — through the generated contract and the app's
 * own mapper — so a field renamed on the wire fails here, not in a shopper's hand.
 */
class EffyWindowsViewTest {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
    private val cases = Json.parseToJsonElement(EFFY_WINDOWS_FIXTURE).jsonObject.getValue("cases").jsonArray

    private fun JsonObject.str(key: String): String? = this[key]?.takeIf { it !is JsonNull }?.jsonPrimitive?.content

    private fun day(e: JsonElement): EffyDayView = e.jsonObject.let { d ->
        EffyDayView(
            date = d.str("date")!!, label = d.str("label")!!, sentence = d.str("sentence"),
            windows = d.getValue("windows").jsonArray.map { it.jsonObject }.map { w ->
                EffyWindowLine(
                    slotId = w.str("slotId")!!, date = w.str("date")!!, label = w.str("label")!!, note = w.str("note"),
                    closed = w.getValue("closed").jsonPrimitive.boolean, surchargeAmount = w.str("surchargeAmount"),
                )
            },
        )
    }

    private fun expected(e: JsonObject) = EffyWindowsView(
        unavailable = e.str("unavailable"),
        sameDayTitle = e.str("sameDayTitle")!!,
        standardTitle = e.str("standardTitle")!!,
        today = e["today"]?.takeIf { it !is JsonNull }?.let(::day),
        later = e.getValue("later").jsonArray.map(::day),
    )

    @Test
    fun `every case in the shared fixture is shown the same here`() {
        assertTrue(cases.size >= 6, "a fixture that loads empty proves nothing")
        for (case in cases) {
            val c = case.jsonObject
            val windows = json.decodeFromJsonElement(EffyWindowsDTO.serializer(), c.getValue("input")).toDomain()
            val now = assertNotNull(DeliveryWindowText.epochMillisOrNull(c.str("now")!!))
            assertEquals(expected(c.getValue("expect").jsonObject), effyWindowsView(windows, now), c.str("name"))
        }
    }

    @Test
    fun `a moment is said relative to today - the twin of the website's`() {
        val aedt: (Long) -> Int = { 11 * 3600 }
        val now = DeliveryWindowText.epochMillisOrNull("2026-10-08T09:00:00+11:00")!!
        fun said(iso: String) = DeliveryWindowText.formatMoment(DeliveryWindowText.epochMillisOrNull(iso)!!, now, aedt)
        assertEquals("2 pm", said("2026-10-08T14:00:00+11:00"))
        assertEquals("tomorrow 11:15 am", said("2026-10-09T11:15:00+11:00"))
        assertEquals("Mon 12 Oct 9 am", said("2026-10-12T09:00:00+11:00"))
    }
}
