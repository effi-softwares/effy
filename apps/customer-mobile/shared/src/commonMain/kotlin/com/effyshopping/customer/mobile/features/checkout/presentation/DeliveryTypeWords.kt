package com.effyshopping.customer.mobile.features.checkout.presentation

import com.effyshopping.customer.mobile.core.platform.melbourneOffsetSeconds
import com.effyshopping.customer.mobile.features.checkout.domain.ArrivalEstimate
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryType
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryWindowText
import com.effyshopping.customer.mobile.features.checkout.domain.OrderDelivery
import com.effyshopping.customer.mobile.features.checkout.domain.OrderTracking

/**
 * Who delivers an order — Effy, or a courier — and how this app says it (079).
 *
 * ⚠ A MIRROR, NOT A SOURCE. These are `DELIVERY_TYPE_WORDS` in
 * `packages/shared-types/src/delivery-type.ts`, the one place they are written; the website renders
 * those constants and `delivery-type.test.ts` reads THIS file and fails if a single character
 * differs. Change the TypeScript, then this.
 *
 * ⚠ THE CUSTOMER'S WORDS FOR AN EFFY ORDER STAY "Same-day delivery" and "Standard delivery". A
 * courier order is never either: it has no window and no day.
 */
object DeliveryTypeWords {
    const val EFFY = "Delivered by Effy"
    const val COURIER = "Courier delivery"
    const val COURIER_PARTNER = "Delivered by a courier partner."
    const val COURIER_ESTIMATE_PREFIX = "Usually arrives in"

    /** ⚠ Never drop this: without it the estimate reads as a promised date. */
    const val COURIER_ESTIMATE_SUFFIX = "— an estimate, not a guaranteed date."
    const val NO_WINDOWS_LEFT = "There are no Effy delivery windows available in the next few days."
    const val COURIER_INSTEAD_OF_WINDOWS = "We can send this order by courier instead."
    const val SAME_DAY = "Same-day delivery"
    const val STANDARD = "Standard delivery"
    const val TRACK_PARCEL = "Track your parcel"
    const val TRACKING_BY_EMAIL = "Tracking for each parcel is sent to you by email."
    const val WITH_COURIER = "Your order is with the courier."
    const val SCHEDULED = "Scheduled delivery"

    /**
     * Said when the server refuses a payment because who delivers is not what this screen showed.
     * ⚠ App-side wording (the website has its own sentence for the same refusal); it says what to do
     * and that nothing was taken.
     */
    const val TYPE_CHANGED = "How this order is delivered has changed. Please check the delivery option — you haven’t been charged."

    /** "Usually arrives in 2–4 business days — an estimate, not a guaranteed date." */
    fun courierEstimateSentence(estimate: String): String = "$COURIER_ESTIMATE_PREFIX $estimate $COURIER_ESTIMATE_SUFFIX"

    /** The two lines a customer reads under "Courier delivery" — at checkout and on the order alike. */
    fun courierLines(estimate: String): List<String> = listOf(COURIER_PARTNER, courierEstimateSentence(estimate))

    /** The customer's word for an Effy delivery. ⚠ Never for a courier order: its method is only routing. */
    fun methodWord(method: String?): String = when (method) {
        "same_day" -> SAME_DAY
        "scheduled" -> SCHEDULED
        else -> STANDARD
    }
}

/** What a customer surface prints for an order's delivery. [heading] is null for an order placed before 079. */
data class DeliverySummary(val heading: String?, val lines: List<String>)

/**
 * How an order is delivered, in the words every customer surface prints.
 *
 * ⚠ THE KOTLIN TWIN OF `deliverySummary` IN `packages/shared-types/src/delivery-type.ts`, run against
 * the SAME fixture (`DeliveryTypeFixture.kt`).
 *
 *   courier                → "Courier delivery" · the partner line, then the estimate as an estimate
 *   Effy, a window today   → "Delivered by Effy" · "Same-day delivery · Today, 4 pm – 6 pm"
 *   Effy, a later day      → "Delivered by Effy" · "Standard delivery · Thu 8 Oct, 4 pm – 6 pm"
 *   placed before 079      → no heading · one line per distinct promise, as it was sold
 *
 * ⚠ A courier order NEVER reads its arrival estimates. ⚠ One line per DISTINCT promise: a line per
 * package told the customer how many suppliers there were.
 */
fun deliverySummary(
    delivery: OrderDelivery?,
    arrivals: List<ArrivalEstimate>,
    nowEpochMillis: Long,
    offsetAt: (Long) -> Int = ::melbourneOffsetSeconds,
): DeliverySummary {
    if (delivery?.type == DeliveryType.COURIER) {
        val lines = DeliveryTypeWords.courierLines(delivery.courierEstimate.orEmpty()).toMutableList()
        // 080 — several consignments: tracking comes by email. One link is drawn by the screen.
        if (delivery.tracking is OrderTracking.ByEmail) lines += DeliveryTypeWords.TRACKING_BY_EMAIL
        return DeliverySummary(DeliveryTypeWords.COURIER, lines)
    }
    fun said(a: ArrivalEstimate?) = DeliveryWindowText.formatArrival(a?.promisedFrom, a?.promisedTo, a?.windowStart, a?.windowEnd, nowEpochMillis, offsetAt)
    val distinct = arrivals.distinctBy { listOf(it.method, it.promisedFrom, it.promisedTo, it.windowStart, it.windowEnd) }
    val lines = if (distinct.isEmpty()) listOf(said(null)) else distinct.map { "${DeliveryTypeWords.methodWord(it.method)} · ${said(it)}" }
    return DeliverySummary(if (delivery?.type == DeliveryType.EFFY) DeliveryTypeWords.EFFY else null, lines)
}
