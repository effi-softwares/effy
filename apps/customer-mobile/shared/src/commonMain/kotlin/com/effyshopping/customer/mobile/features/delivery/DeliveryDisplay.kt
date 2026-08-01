package com.effyshopping.customer.mobile.features.delivery

/**
 * How a set delivery location is written out (030 FR-033 / FR-034 / FR-034a / FR-034b).
 *
 * ONE rule, stated once in `specs/030-delivery-location-suburb/contracts/locality.contract.md` §2 and
 * implemented twice — here and in `customer-web`'s `lib/delivery-display.ts`. Both are unit-tested
 * against the SAME four-row table, **against the table rather than against the implementation**.
 * 028 and 029 both shipped tests whose fixtures agreed with the code instead of with the world
 * (029's banner test literally asserted the defect it existed to catch); this is the counter-measure.
 *
 * | locality | state | renders as         | when                                        |
 * |----------|-------|--------------------|---------------------------------------------|
 * | Richmond | VIC   | Richmond VIC 3121  | the shopper chose a place from the list      |
 * | null     | VIC   | VIC 3121           | bare postcode covering SEVERAL localities    |
 * | Melbourne| VIC   | Melbourne VIC 3000 | bare postcode covering EXACTLY ONE locality  |
 * | null     | null  | 3121               | the locality lookup failed                   |
 *
 * ⚠ Row 4 is FR-034b: not knowing what a postcode is CALLED must never stop us answering whether we
 * DELIVER there. The verdict is independent of this function.
 *
 * ⚠ It never returns an empty string for a set location — a location that renders as nothing is
 * indistinguishable from no location at all, and the shopper would see "Set your delivery location"
 * while one is stored.
 */
fun formatPlace(context: DeliveryContext): String =
    listOfNotNull(context.locality, context.state, context.postcode).joinToString(" ")

/**
 * The same place, phrased for a screen reader (FR-042).
 *
 * ⚠ Built FROM [formatPlace], not alongside it. A sighted and a non-sighted shopper being told about
 * differently-worded places is the same defect as showing the wrong place, and it is exactly what
 * drifts when the two are written separately.
 *
 * ⚠ Returns null when there is no answer yet. `serviced == null` means "we have not got an answer" —
 * it is NOT "no", and announcing it as one is the outcome this whole capability exists to prevent.
 */
fun announcePlace(context: DeliveryContext): String? = when (context.serviced) {
    true -> "Effy delivers to ${formatPlace(context)}."
    false -> "Effy does not deliver to ${formatPlace(context)} yet."
    null -> null
}
