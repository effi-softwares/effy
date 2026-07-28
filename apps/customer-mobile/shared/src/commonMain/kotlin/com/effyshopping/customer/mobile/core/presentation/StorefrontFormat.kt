package com.effyshopping.customer.mobile.core.presentation

import kotlin.math.roundToInt

/**
 * Storefront presentation formatting — the pure half of the storefront vocabulary (025).
 *
 * ⚠ These live OUTSIDE the composables on purpose. Both were previously private functions
 * copy-pasted into the screens that needed them — `money` into SIX files — so a formatting fix had
 * to be found six times, and the compare-at rule was expressed differently in each. They are pure
 * string/number functions with no Compose dependency, so they are also the only part of the card
 * that can be unit-tested without a UI harness.
 *
 * Mirrors `apps/customer-web/lib/money.ts`, which is the same two functions on the web surface.
 */

/**
 * Format a wire amount for display.
 *
 * The amount arrives as an already-2dp decimal STRING (`numeric(12,2)::text` — research R9), never a
 * float, so there is no rounding to do here and none should be introduced: parsing to a Double to
 * "format" it is how a storefront starts showing $19.989999.
 */
fun money(amount: String, currency: String): String =
    if (currency == "AUD") "$$amount" else "$currency $amount"

/**
 * Whether a product is genuinely discounted.
 *
 * ⚠ A `compareAtAmount` that is present but NOT above the price is not a discount — it is stale or
 * mis-entered data, and rendering it would print a struck-through price identical to (or below) the
 * price being charged. Every caller must gate on this rather than on `compareAtAmount != null`.
 */
fun isDiscounted(priceAmount: String, compareAtAmount: String?): Boolean {
    val compare = compareAtAmount?.toDoubleOrNull() ?: return false
    val price = priceAmount.toDoubleOrNull() ?: return false
    return compare > price
}

/**
 * The discount as a whole percentage, or null when there is nothing to claim.
 *
 * ⚠ ROUNDS, matching `ProductCard.tsx`'s `Math.round(...)` on the web. Truncating instead would put
 * the two surfaces one point apart on most products — a $10 item at $6.66 reads "-33%" on one and
 * "-34%" on the other, which is the kind of difference a shopper notices and support cannot explain.
 *
 * Returns null rather than 0 when the saving rounds to nothing, so a "-0%" chip can never render.
 */
fun discountPercent(priceAmount: String, compareAtAmount: String?): Int? {
    if (!isDiscounted(priceAmount, compareAtAmount)) return null
    val compare = compareAtAmount?.toDoubleOrNull() ?: return null
    val price = priceAmount.toDoubleOrNull() ?: return null
    return ((compare - price) / compare * 100).roundToInt().takeIf { it > 0 }
}
