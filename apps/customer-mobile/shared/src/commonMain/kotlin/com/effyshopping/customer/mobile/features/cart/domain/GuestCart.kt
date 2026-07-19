package com.effyshopping.customer.mobile.features.cart.domain

/**
 * The device-local guest cart (019 US2). Lines are SNAPSHOTTED (name/price/image at add time) so a
 * later catalog price change never silently mutates what the guest saw (R8). On sign-in the guest cart
 * is merged into the authoritative server cart (US3). The ops below are pure + unit-tested.
 */

const val MAX_CART_QTY = 99

data class GuestCartLine(
    val productId: String,
    val name: String,
    val imageUrl: String?,
    val unitPriceAmount: String,
    val currency: String,
    val quantity: Int,
)

/** Add or increment a line, clamping quantity to the max. */
fun addLine(lines: List<GuestCartLine>, line: GuestCartLine): List<GuestCartLine> {
    val existing = lines.any { it.productId == line.productId }
    return if (existing) {
        lines.map {
            if (it.productId == line.productId) it.copy(quantity = minOf(it.quantity + line.quantity, MAX_CART_QTY)) else it
        }
    } else {
        lines + line.copy(quantity = line.quantity.coerceIn(1, MAX_CART_QTY))
    }
}

/** Set a line's quantity; 0 or less removes it. */
fun setLineQty(lines: List<GuestCartLine>, productId: String, quantity: Int): List<GuestCartLine> =
    if (quantity <= 0) {
        lines.filterNot { it.productId == productId }
    } else {
        lines.map { if (it.productId == productId) it.copy(quantity = minOf(quantity, MAX_CART_QTY)) else it }
    }

/** Remove a line. */
fun removeLine(lines: List<GuestCartLine>, productId: String): List<GuestCartLine> =
    lines.filterNot { it.productId == productId }

/** Total item count (sum of quantities) — the cart badge. */
fun cartCount(lines: List<GuestCartLine>): Int = lines.sumOf { it.quantity }
