package com.effyshopping.customer.mobile.core.presentation

import kotlin.math.roundToInt

/** Storefront formatting, pure and unit-tested; mirrors `apps/customer-web/lib/money.ts`. */

/** Format a wire amount: it arrives as a 2dp decimal string, so nothing is rounded (and never parsed to a Double). */
fun money(amount: String, currency: String): String =
    if (currency == "AUD") "$$amount" else "$currency $amount"

/**
 * Whether a product is genuinely discounted.
 *
 * A `compareAtAmount` that is present but not above the price is not a discount — it is stale or
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
 * Rounds, matching `ProductCard.tsx`'s `Math.round(...)` on the web. Truncating instead would put
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
