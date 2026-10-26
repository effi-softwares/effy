package com.effyshopping.customer.mobile.features.cart.domain

import com.effyshopping.customer.mobile.features.catalog.domain.UnitPrice
import kotlinx.serialization.Serializable

/**
 * The cart's line shape and the pure operations over it: the line of both the guest cart and the mirror
 * of the account cart (the name predates that). Name, price and image are captured at add time for instant
 * rendering, reconciled on read; never the authority on what a shopper pays.
 */

const val MAX_CART_QTY = 99

@Serializable
data class GuestCartLine(
    /** The line's identity: the size being bought. */
    val variantId: String,
    /** The product it is a size of — for opening its page. */
    val productId: String,
    val name: String,
    /** The size's words ("1 kg"); null for a product sold one way. */
    val variantLabel: String? = null,
    /** Sold to adults only: the line says 18+ (101). */
    val ageRestricted: Boolean = false,
    /** The comparison price, as the platform gave it. */
    val unitPrice: UnitPrice? = null,
    val imageUrl: String?,
    val unitPriceAmount: String,
    val currency: String,
    val quantity: Int,
    /**
     * Opaque package grouping token, captured at add-time from the product — not a shop id,
     * name, or location. Items sharing a `packageKey` ship together as one anonymous "package" (one per
     * fulfilling shop). It lets the cart show the split while revealing no shop. Blank
     * when the storefront read carries no token yet — those lines degrade to a single anonymous package.
     */
    val packageKey: String = "",
    /**
     * Whether the platform still considers this purchasable. An unavailable line stays visible and
     * flagged (a temporary state may be waited out) but contributes to NO total and cannot be paid for.
     * Defaults true so a line built locally before the platform has spoken renders normally.
     */
    val available: Boolean = true,
    /**
     * The price this line was added at, when the platform reports it differs from the current one.
     * Null means there is no change to report. The shopper always pays [unitPriceAmount].
     */
    val priceChangedFrom: String? = null,
)

/**
 * One anonymous package in the cart — the items sharing a `packageKey`, shown without any
 * shop identity or location. `index` is a 1-based ordinal used only to label it "Package N".
 */
data class CartPackage(val packageKey: String, val index: Int, val lines: List<GuestCartLine>)

/**
 * Group cart lines into anonymous packages by `packageKey`. Lines with a blank key (no token
 * from the storefront read yet) collapse into one package, so a single-shop / untagged cart degrades
 * gracefully to one part with no artificial "package 1 of 1" framing. Order is stable (first
 * appearance). Never exposes a shop — only an ordinal.
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
    val existing = lines.any { it.variantId == line.variantId }
    return if (existing) {
        lines.map {
            if (it.variantId == line.variantId) it.copy(quantity = minOf(it.quantity + line.quantity, MAX_CART_QTY)) else it
        }
    } else {
        lines + line.copy(quantity = line.quantity.coerceIn(1, MAX_CART_QTY))
    }
}

/** Set a line's quantity; 0 or less removes it. */
fun setLineQty(lines: List<GuestCartLine>, variantId: String, quantity: Int): List<GuestCartLine> =
    if (quantity <= 0) {
        lines.filterNot { it.variantId == variantId }
    } else {
        lines.map { if (it.variantId == variantId) it.copy(quantity = minOf(quantity, MAX_CART_QTY)) else it }
    }

/** Remove a line. */
fun removeLine(lines: List<GuestCartLine>, variantId: String): List<GuestCartLine> =
    lines.filterNot { it.variantId == variantId }

/** Total item count (sum of quantities) — the cart badge. */
fun cartCount(lines: List<GuestCartLine>): Int = lines.sumOf { it.quantity }
