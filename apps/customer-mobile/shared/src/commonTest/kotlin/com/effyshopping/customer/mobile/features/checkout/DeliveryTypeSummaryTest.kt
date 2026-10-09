package com.effyshopping.customer.mobile.features.checkout

import com.effyshopping.customer.mobile.features.checkout.domain.ArrivalEstimate
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryType
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryWindowText
import com.effyshopping.customer.mobile.features.checkout.domain.OrderDelivery
import com.effyshopping.customer.mobile.features.checkout.domain.OrderTracking
import com.effyshopping.customer.mobile.features.checkout.presentation.DeliverySummary
import com.effyshopping.customer.mobile.features.checkout.presentation.DeliveryTypeWords
import com.effyshopping.customer.mobile.features.checkout.presentation.deliverySummary
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * 079 — this app says how an order is delivered in the SAME words as the website and the emailed
 * receipt: every case of the shared fixture, through this app's own `deliverySummary`.
 *
 * (See [DELIVERY_TYPE_FIXTURE] for why the fixture is a copy and what keeps it honest; that the
 * constants in `DeliveryTypeWords.kt` are the website's is held from the other side, by
 * `packages/shared-types/src/delivery-type.test.ts`.)
 */
class DeliveryTypeSummaryTest {
    private val root = Json.parseToJsonElement(DELIVERY_TYPE_FIXTURE).jsonObject
    private val cases = root.getValue("cases").jsonArray
    // The fixture's instants carry +11:00 (Melbourne in October). Fixed, so the test does not depend
    // on the host's timezone database.
    private val aedt: (Long) -> Int = { 11 * 3600 }

    private fun JsonObject.str(key: String): String? = this[key]?.takeIf { it !is JsonNull }?.jsonPrimitive?.content

    private fun delivery(input: JsonObject): OrderDelivery? =
        input["delivery"]?.takeIf { it !is JsonNull }?.jsonObject?.let {
            OrderDelivery(
                type = if (it.str("type") == "courier") DeliveryType.COURIER else DeliveryType.EFFY,
                courierEstimate = it.str("courierEstimate"),
                tracking = it["tracking"]?.takeIf { t -> t !is JsonNull }?.jsonObject?.let { t ->
                    if (t.str("kind") == "email") OrderTracking.ByEmail else OrderTracking.Link(t.str("url")!!, t.str("courierName")!!)
                },
            )
        }

    private fun arrivals(input: JsonObject): List<ArrivalEstimate> = input.getValue("arrivalEstimates").jsonArray.map { e ->
        val a = e.jsonObject
        ArrivalEstimate(
            method = a.str("method") ?: "standard",
            promisedFrom = a.str("promisedFrom"), promisedTo = a.str("promisedTo"),
            windowStart = a.str("windowStart"), windowEnd = a.str("windowEnd"),
        )
    }

    @Test
    fun `every case in the shared fixture is said the same here`() {
        assertTrue(cases.size >= 9, "a fixture that loads empty proves nothing")
        for (case in cases) {
            val c = case.jsonObject
            val input = c.getValue("input").jsonObject
            val expect = c.getValue("expect").jsonObject
            val now = assertNotNull(DeliveryWindowText.epochMillisOrNull(c.str("now")!!))
            assertEquals(
                DeliverySummary(heading = expect.str("heading"), lines = expect.getValue("lines").jsonArray.map { it.jsonPrimitive.content }),
                deliverySummary(delivery(input), arrivals(input), now, aedt),
                c.str("name"),
            )
        }
    }

    @Test
    fun `the fixture's words are this app's words`() {
        val words = root.getValue("words").jsonObject
        assertEquals(
            mapOf(
                "effy" to DeliveryTypeWords.EFFY, "courier" to DeliveryTypeWords.COURIER,
                "courierPartner" to DeliveryTypeWords.COURIER_PARTNER,
                "courierEstimatePrefix" to DeliveryTypeWords.COURIER_ESTIMATE_PREFIX,
                "courierEstimateSuffix" to DeliveryTypeWords.COURIER_ESTIMATE_SUFFIX,
                "noWindowsLeft" to DeliveryTypeWords.NO_WINDOWS_LEFT,
                "courierInsteadOfWindows" to DeliveryTypeWords.COURIER_INSTEAD_OF_WINDOWS,
                "trackParcel" to DeliveryTypeWords.TRACK_PARCEL, "trackingByEmail" to DeliveryTypeWords.TRACKING_BY_EMAIL,
                "withCourier" to DeliveryTypeWords.WITH_COURIER,
                "sameDay" to DeliveryTypeWords.SAME_DAY, "standard" to DeliveryTypeWords.STANDARD, "scheduled" to DeliveryTypeWords.SCHEDULED,
            ),
            words.mapValues { it.value.jsonPrimitive.content },
        )
    }

    @Test
    fun `a courier order never says same-day, standard, a day or a time - and its estimate is said as one`() {
        val s = deliverySummary(
            OrderDelivery(DeliveryType.COURIER, "2–4 business days"),
            // ⚠ What its packages hold is routing, and is never read.
            listOf(ArrivalEstimate(method = "standard", promisedFrom = "2026-10-09", promisedTo = "2026-10-09")),
            DeliveryWindowText.epochMillisOrNull("2026-10-08T09:00:00+11:00")!!, aedt,
        )
        val said = (listOfNotNull(s.heading) + s.lines).joinToString(" ")
        for (word in listOf("standard", "same-day", "tomorrow", "Fri", "confirm")) assertFalse(said.contains(word, ignoreCase = true), said)
        assertTrue(s.lines.last().endsWith("an estimate, not a guaranteed date."), said)
    }

    @Test
    fun the_receipt_s_tracking_link_says_the_website_s_words_with_the_courier_when_named() {
        assertEquals(
            "Track your parcel with Test Courier",
            com.effyshopping.customer.mobile.features.checkout.presentation.trackingLinkLabel(OrderTracking.Link("https://track.example.test/A1", "Test Courier")),
        )
        assertEquals(
            DeliveryTypeWords.TRACK_PARCEL,
            com.effyshopping.customer.mobile.features.checkout.presentation.trackingLinkLabel(OrderTracking.Link("https://track.example.test/A1", "")),
        )
    }
}
