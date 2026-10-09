package com.effyshopping.shop.mobile.features.orders.domain

/**
 * 080 US2 — the words a shop reads about a courier collecting a parcel from it.
 *
 * ⚠ THE SAME WORDS AS shop-web's `courierPickup.ts` (`courierPickupLine`, `pickupWhen`) — both are
 * pinned by their own tests to the same sentences.
 */

private val WEEKDAYS = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
private val MONTHS = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

/** "Thu 15 Oct" from "2026-10-15" — the date as written, never shifted by a device's zone. */
fun pickupDay(date: String): String {
    val (y, m, d) = date.split("-").map { it.toInt() }
    return "${WEEKDAYS[isoWeekday(y, m, d) - 1]} $d ${MONTHS[m - 1]}"
}

/** ISO weekday (1 = Monday) of a civil date — Sakamoto's method, no calendar library. */
private fun isoWeekday(y: Int, m: Int, d: Int): Int {
    val t = intArrayOf(0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4)
    val yy = if (m < 3) y - 1 else y
    val sunday0 = (yy + yy / 4 - yy / 100 + yy / 400 + t[m - 1] + d) % 7
    return if (sunday0 == 0) 7 else sunday0
}

/** "1 pm" / "1:30 pm" from "13:00" / "13:30". */
fun clock12(hhmm: String): String {
    val (h, m) = hhmm.split(":").map { it.toInt() }
    val suffix = if (h >= 12) "pm" else "am"
    val hour = if (h % 12 == 0) 12 else h % 12
    return if (m == 0) "$hour $suffix" else "$hour:${m.toString().padStart(2, '0')} $suffix"
}

/** "Thu 15 Oct, 1–3 pm" — or just the day when no window was booked. */
fun pickupWhen(p: CourierPickup): String? {
    val date = p.pickupDate ?: return null
    val day = pickupDay(date)
    val fromRaw = p.pickupFrom
    val toRaw = p.pickupTo
    if (fromRaw == null || toRaw == null) return day
    val from = clock12(fromRaw)
    val to = clock12(toRaw)
    val sameHalf = from.takeLast(2) == to.takeLast(2)
    return "$day, ${if (sameHalf) from.dropLast(3) else from}–$to"
}

/** The one line in a queue row. */
fun courierPickupLine(p: CourierPickup): String = when (p.state) {
    CourierPickupState.HANDED_OVER -> "Handed over to courier"
    CourierPickupState.BOOKED -> pickupWhen(p)?.let { "Courier pickup · $it" } ?: "Courier pickup booked"
    else -> "Courier pickup · being arranged"
}

/** Only a booked pickup, on a packed parcel, can be handed over. */
fun canHandOver(p: CourierPickup?, status: FulfillmentState): Boolean =
    p?.state == CourierPickupState.BOOKED && status == FulfillmentState.READY_FOR_PICKUP
