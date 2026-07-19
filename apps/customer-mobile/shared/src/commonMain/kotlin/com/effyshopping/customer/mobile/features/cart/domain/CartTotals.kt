package com.effyshopping.customer.mobile.features.cart.domain

/**
 * Client-side cart totals for DISPLAY (019 US3), integer-cents math mirroring core-api's money/pricing.
 * The SERVER recomputes the authoritative amount at checkout — this is only the guest-cart estimate.
 */

const val DELIVERY_FEE_CENTS = 500L

data class CartTotals(val itemSubtotal: String, val deliveryFee: String, val grandTotal: String)

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
    val delivery = if (subtotal > 0) DELIVERY_FEE_CENTS else 0L
    return CartTotals(
        itemSubtotal = formatCents(subtotal),
        deliveryFee = formatCents(delivery),
        grandTotal = formatCents(subtotal + delivery),
    )
}
