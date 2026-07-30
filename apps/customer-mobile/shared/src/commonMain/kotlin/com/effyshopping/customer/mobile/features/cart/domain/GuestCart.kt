package com.effyshopping.customer.mobile.features.cart.domain

import kotlinx.serialization.Serializable

/**
 * The cart's line shape and the pure operations over it.
 *
 * ⚠ NAME (027): `GuestCartLine` is now a misnomer kept deliberately for one slice. Since 027 the PLATFORM
 * is authoritative for a signed-in shopper's cart and this type is the line shape of BOTH the guest cart
 * and the mirror of the account cart. The rename belongs with the presentation rewrite (Phase 5), not
 * scattered through a contract change.
 *
 * Lines still carry name/price/image captured at add time, but their meaning has changed: they are a
 * MIRROR to render instantly, reconciled against the platform on read — never the authority on what a
 * shopper pays (027 FR-006/FR-027). The ops below are pure + unit-tested.
 */

const val MAX_CART_QTY = 99

@Serializable
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
    /**
     * 027 — whether the platform still considers this purchasable. An unavailable line stays visible and
     * flagged (a temporary state may be waited out) but contributes to NO total and cannot be paid for
     * (FR-022). Defaults true so a line built locally before the platform has spoken renders normally.
     */
    val available: Boolean = true,
    /**
     * 027 — the price this line was added at, when the platform reports it differs from the current one
     * (FR-023). Null means there is no change to report. The shopper always pays [unitPriceAmount].
     */
    val priceChangedFrom: String? = null,
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
