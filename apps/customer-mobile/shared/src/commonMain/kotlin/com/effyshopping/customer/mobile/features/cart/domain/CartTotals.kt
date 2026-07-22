package com.effyshopping.customer.mobile.features.cart.domain

/**
 * Client-side cart totals for DISPLAY, integer-cents math mirroring core-api's money/pricing.
 *
 * 021: the flat $5 delivery fee is GONE (FR-024). Delivery is now geographic + per-package and is only
 * known once an address is chosen at the delivery step, from the server quote — so the cart shows the
 * ITEM SUBTOTAL ONLY. The server recomputes the authoritative grand total (items + summed per-package
 * fees) at checkout; this is only the guest-cart item estimate.
 */

data class CartTotals(val itemSubtotal: String)

fun parseCents(amount: String): Long {
    val negative = amount.startsWith("-")
    val clean = amount.removePrefix("-")
    val parts = clean.split(".")
    val whole = parts.getOrNull(0)?.toLongOrNull() ?: 0L
    val fracRaw = (parts.getOrNull(1) ?: "") + "00"
    val frac = fracRaw.substring(0, 2).toLongOrNull() ?: 0L
    val cents = whole * 100 + frac
    return if (negative) -cents else cents
}

fun formatCents(cents: Long): String {
    val negative = cents < 0
    val abs = if (negative) -cents else cents
    val whole = abs / 100
    val frac = (abs % 100).toString().padStart(2, '0')
    return "${if (negative) "-" else ""}$whole.$frac"
}

fun computeTotals(lines: List<GuestCartLine>): CartTotals {
    val subtotal = lines.sumOf { parseCents(it.unitPriceAmount) * it.quantity }
    return CartTotals(itemSubtotal = formatCents(subtotal))
}
