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
    /**
     * OPAQUE package grouping token (021 FR-005a), captured at add-time from the product — NOT a shop id,
     * name, or location. Items sharing a `packageKey` ship together as one anonymous "package" (one per
     * fulfilling shop). It lets the cart show the split (021 US1) while revealing no shop (SC-006). Blank
     * when the storefront read carries no token yet — those lines degrade to a single anonymous package.
     */
    val packageKey: String = "",
)

/**
 * One anonymous package in the cart (021 FR-005a) — the items sharing a `packageKey`, shown WITHOUT any
 * shop identity or location. `index` is a 1-based ordinal used only to label it "Package N".
 */
data class CartPackage(val packageKey: String, val index: Int, val lines: List<GuestCartLine>)

/**
 * Group cart lines into anonymous packages by `packageKey` (021 US1). Lines with a blank key (no token
 * from the storefront read yet) collapse into ONE package, so a single-shop / untagged cart degrades
 * gracefully to one part with no artificial "package 1 of 1" framing (SC-011). Order is stable (first
 * appearance). NEVER exposes a shop — only an ordinal.
 */
fun packagesOf(lines: List<GuestCartLine>): List<CartPackage> {
    val order = mutableListOf<String>()
    val grouped = LinkedHashMap<String, MutableList<GuestCartLine>>()
    for (line in lines) {
        val key = line.packageKey
        if (key !in grouped) {
            grouped[key] = mutableListOf()
            order += key
        }
        grouped.getValue(key) += line
    }
    return order.mapIndexed { i, key -> CartPackage(packageKey = key, index = i + 1, lines = grouped.getValue(key)) }
}

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
