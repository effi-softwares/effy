package com.effyshopping.customer.mobile.features.cart.domain

import kotlinx.serialization.Serializable

/**
 * The whole cart as the app holds it — the shape the mirror persists and the UI renders (027).
 *
 * ⚠ [revision] is the only reason this type carries a number nobody displays. The platform advances it on
 * every mutation, and the mirror adopts a response ONLY when its revision is greater than the one it
 * holds. That single comparison is what stops an out-of-order reply — a slow response to an old tap
 * landing after a fast response to a new one — from resurrecting a stale cart (FR-009).
 *
 * A guest's snapshot has revision 0 and is reconciled against `POST /v1/cart/preview` instead of a server
 * cart, because a guest has none.
 */
@Serializable
data class CartSnapshot(
    val revision: Long = 0,
    val lines: List<GuestCartLine> = emptyList(),
    /** Set aside for later: kept, shown honestly, counted in NO total (FR-028…FR-031). */
    val savedLines: List<GuestCartLine> = emptyList(),
    val itemSubtotalAmount: String = "0.00",
    val discountAmount: String = "0.00",
    /** Always "0.00" in the cart — delivery is priced at the delivery step, once an address exists. */
    val grandTotalAmount: String = "0.00",
    val currency: String = "AUD",
    val notices: List<CartNotice> = emptyList(),
    val discount: CartDiscount? = null,
    val checkout: CartCheckout = CartCheckout(),
    val limits: CartLimits = CartLimits(),
    /** How many changes are still on their way to the platform. Not persisted — derived from the queue. */
    val pending: Int = 0,
    /** Set when a change was definitively refused and the shopper has not been told yet. */
    val failure: String? = null,
) {
    /** The badge count — the sum of payable quantities, read locally so it never waits on a network. */
    val itemCount: Int get() = lines.sumOf { it.quantity }

    /**
     * Changes the platform has not accepted yet (FR-017), and the message for any it definitively refused
     * (FR-019). Held on the snapshot so the UI has ONE thing to read; the queue itself is the coordinator's.
     */
    val unsavedCount: Int get() = pending
    val failureMessage: String? get() = failure

    val isEmpty: Boolean get() = lines.isEmpty()
}

@Serializable
data class CartNotice(
    /** Null for a cart-level notice (a promotional code that stopped applying). */
    val productId: String? = null,
    val kind: CartNoticeKind,
    /** Specifics where the kind alone is not enough. NEVER names or implies a shop. */
    val detail: String? = null,
)

@Serializable
enum class CartNoticeKind {
    Unavailable,
    PriceChanged,
    Removed,
    QuantityClamped,
    CartFull,
    PromoNoLongerApplies,
    /** A kind this build does not know — a newer platform. Rendered as nothing rather than crashing. */
    Unknown,
}

@Serializable
data class CartDiscount(
    val code: String,
    val kind: String,
    val amount: String,
    val label: String,
)

/**
 * Whether the shopper may proceed, and why not when they may not — so the cart says it up front instead
 * of letting them walk into a refusal at payment (FR-054).
 */
@Serializable
data class CartCheckout(
    val allowed: Boolean = false,
    val blockedReason: CartBlockedReason? = null,
    /** Null when no minimum is in force; the UI then shows nothing about one at all (FR-057). */
    val minimumSubtotalAmount: String? = null,
    val remainingAmount: String? = null,
)

@Serializable
enum class CartBlockedReason { Empty, NoPayableItems, BelowMinimum, Unknown }

/** The platform's ceilings, carried so the app can EXPLAIN them rather than guess them (FR-037/038). */
@Serializable
data class CartLimits(
    val maxLineQuantity: Int = MAX_CART_QTY,
    val maxDistinctItems: Int = 100,
)

/** The public order rules, for a guest who has no server cart to read them from. */
data class CartPolicy(
    val minimumSubtotalAmount: String,
    val currency: String,
    val maxLineQuantity: Int,
    val maxDistinctItems: Int,
)

/** The outcome of a reorder: the cart, plus exactly what could not come back (FR-035). */
data class ReorderOutcome(
    val cart: CartSnapshot,
    val skipped: List<ReorderSkipped>,
)

data class ReorderSkipped(
    val productId: String,
    val name: String?,
    val reason: ReorderSkipReason,
)

enum class ReorderSkipReason { Unavailable, Removed, CartFull, Clamped, Unknown }
