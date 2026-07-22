package com.effyshopping.shop.mobile.features.orders.domain

/**
 * The order-fulfillment domain (020 US1–US4). PURE models — no wire concern reaches here; the generated
 * DTOs in `packages/shared-types/contract-shop` are mapped in `data/OrderMappers.kt` and never escape the
 * data layer (Principle VI).
 *
 * Two things are deliberately ABSENT from this file, and their absence is a requirement rather than an
 * omission: there is **no payment model of any kind** (FR-008) and **no other shop's items, totals or
 * identity** (FR-007). A portion is only ever this shop's slice of an order — the client cannot even
 * express the concepts it must not display.
 */

/**
 * The fulfillment state machine (FR-011). `PENDING` is written by the 019 fan-out; `RECEIVED` happens
 * implicitly when an operator first opens the portion (FR-011a); `COLLECTED` is reachable only through the
 * dev-only pickup stub and is terminal + immutable (FR-011f).
 */
enum class FulfillmentState(val key: String, val label: String) {
    PENDING("pending", "New"),
    RECEIVED("received", "Received"),
    PICKING("picking", "Picking"),
    READY_FOR_PICKUP("ready_for_pickup", "Ready for pickup"),
    COLLECTED("collected", "Collected"),
    DELIVERED("delivered", "Delivered"),
    ;

    /** Items may only be picked while the portion is being worked (contract: PATCH is legal only in `picking`). */
    val isPickable: Boolean get() = this == PICKING

    /** Once collected/delivered (the driver-stub tail), nothing may change (FR-011f). */
    val isImmutable: Boolean get() = this == COLLECTED || this == DELIVERED
}

/** Which slice of the queue to read (FR-016). Completed work leaves the active queue but stays openable. */
enum class QueueState(val key: String, val label: String) {
    ACTIVE("active", "Active"),
    COMPLETED("completed", "Completed"),
}

/**
 * The only transitions a shop may REQUEST (FR-011/FR-011d). `pending` belongs to the fan-out, `received` is
 * implicit on first open, and `collected` belongs to the pickup stub alone — so none of them appear here.
 * `READY_FOR_PICKUP -> PICKING` is the one permitted reversal, expressed by requesting [PICKING] again.
 */
enum class FulfillmentTransition(val key: String) {
    PICKING("picking"),
    READY_FOR_PICKUP("ready_for_pickup"),
}

/**
 * What the customer bought and when this shop must be ready — READ-ONLY to the shop (FR-009a); owned by 021.
 * Says NOTHING about who delivers: there is no carrier, driver or provider concept here, by design (FR-002a).
 */
data class DeliveryPromise(val serviceLevel: String, val readyBy: String)

/**
 * A row in the shop's queue (US1). Counts are THIS shop's alone — never the order's totals (FR-007).
 * [atRisk] is computed by the backend against the promise and drives in-place escalation, never reordering
 * (FR-001a): the queue order is stable because both of its keys are immutable once the order is placed.
 */
data class FulfillmentSummary(
    val id: String,
    val orderNumber: String,
    val placedAt: String,
    val status: FulfillmentState,
    val stateChangedAt: String,
    val itemCount: Int,
    val gatheredCount: Int,
    val unavailableCount: Int,
    val promise: DeliveryPromise,
    val atRisk: Boolean,
) {
    /** Progress for the queue row — "2/4 gathered" reads at arm's length without opening the order. */
    val settledCount: Int get() = gatheredCount + unavailableCount
}

/**
 * One line to pick. Quantities are ABSOLUTE, never deltas — the same discipline the wire uses, so a retry on
 * a flaky shop tablet is idempotent rather than cumulative.
 */
data class FulfillmentItem(
    val orderItemId: String,
    val name: String,
    val sku: String? = null,
    val imageUrl: String? = null,
    val orderedQuantity: Int,
    val gatheredQuantity: Int,
    val unavailableQuantity: Int,
) {
    /** Still to account for. `gathered + unavailable <= ordered` is enforced server-side and by a DB CHECK. */
    val outstandingQuantity: Int get() = (orderedQuantity - gatheredQuantity - unavailableQuantity).coerceAtLeast(0)

    /** Every unit is either on the trolley or flagged — the line needs no further attention. */
    val isSettled: Boolean get() = outstandingQuantity == 0

    val isFlagged: Boolean get() = unavailableQuantity > 0
}

/**
 * The delivery context a shop needs to prepare and label the order (FR-009). Snapshotted at placement by
 * 019, so it never changes retroactively.
 */
data class DeliveryContext(
    val recipientName: String,
    val line1: String,
    val line2: String? = null,
    val city: String,
    val region: String? = null,
    val postalCode: String,
    val country: String,
    val phone: String? = null,
) {
    /** The address as label-ready lines — the shop reads it, it is never parsed back. */
    val addressLines: List<String>
        get() = listOfNotNull(
            line1.takeIf { it.isNotBlank() },
            line2?.takeIf { it.isNotBlank() },
            listOfNotNull(city.takeIf { it.isNotBlank() }, region?.takeIf { it.isNotBlank() }, postalCode.takeIf { it.isNotBlank() })
                .joinToString(" ")
                .takeIf { it.isNotBlank() },
            country.takeIf { it.isNotBlank() },
        )
}

/** The pick screen (US2) — this shop's lines only, plus the context needed to prepare and label the order. */
data class FulfillmentDetail(
    val id: String,
    val orderNumber: String,
    val placedAt: String,
    val status: FulfillmentState,
    val stateChangedAt: String,
    val promise: DeliveryPromise,
    val delivery: DeliveryContext,
    val items: List<FulfillmentItem>,
) {
    val itemCount: Int get() = items.sumOf { it.orderedQuantity }
    val gatheredCount: Int get() = items.sumOf { it.gatheredQuantity }
    val unavailableCount: Int get() = items.sumOf { it.unavailableQuantity }

    /** Every line accounted for — the cue to offer "ready for pickup", never a gate on it (FR-010c). */
    val isFullySettled: Boolean get() = items.isNotEmpty() && items.all { it.isSettled }

    /**
     * The transition this portion is next eligible for, or null when the shop has nothing left to do.
     * `PENDING` maps to `PICKING` too: the read that showed the portion already acknowledged it (FR-011a),
     * so the operator's next deliberate act is to start picking.
     */
    val nextTransition: FulfillmentTransition?
        get() = when (status) {
            FulfillmentState.PENDING, FulfillmentState.RECEIVED -> FulfillmentTransition.PICKING
            FulfillmentState.PICKING -> FulfillmentTransition.READY_FOR_PICKUP
            FulfillmentState.READY_FOR_PICKUP, FulfillmentState.COLLECTED, FulfillmentState.DELIVERED -> null
        }

    /** The ONE permitted reversal (FR-011d) — offered only while the portion has not been collected. */
    val canReverse: Boolean get() = status == FulfillmentState.READY_FOR_PICKUP
}

/**
 * Recorded picking progress for one line. Both fields are ABSOLUTE and independently optional — sending only
 * [unavailableQuantity] = 0 is how an item is UN-FLAGGED when it turns up after all (FR-010d).
 */
data class ItemProgress(
    val gatheredQuantity: Int? = null,
    val unavailableQuantity: Int? = null,
)
