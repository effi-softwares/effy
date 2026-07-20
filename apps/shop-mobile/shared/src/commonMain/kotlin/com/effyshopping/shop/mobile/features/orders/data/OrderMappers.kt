package com.effyshopping.shop.mobile.features.orders.data

import com.effyshopping.shop.mobile.contract.DeliveryPromiseDTO
import com.effyshopping.shop.mobile.contract.FulfillmentDeliveryDTO
import com.effyshopping.shop.mobile.contract.FulfillmentDetailDTO
import com.effyshopping.shop.mobile.contract.FulfillmentItemDTO
import com.effyshopping.shop.mobile.contract.FulfillmentQueueDTO
import com.effyshopping.shop.mobile.contract.FulfillmentQueueState
import com.effyshopping.shop.mobile.contract.FulfillmentStatus
import com.effyshopping.shop.mobile.contract.FulfillmentSummaryDTO
import com.effyshopping.shop.mobile.contract.ItemProgressRequest
import com.effyshopping.shop.mobile.contract.RequestableTransition
import com.effyshopping.shop.mobile.contract.TransitionRequest
import com.effyshopping.shop.mobile.features.orders.domain.DeliveryContext
import com.effyshopping.shop.mobile.features.orders.domain.DeliveryPromise
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentDetail
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentItem
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentState
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentSummary
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentTransition
import com.effyshopping.shop.mobile.features.orders.domain.ItemProgress
import com.effyshopping.shop.mobile.features.orders.domain.QueueState

/**
 * Wire ↔ domain mapping (Principle VI). DTOs live ONLY in this direction — the domain never sees a DTO, the
 * wire never sees a domain model. Every `Double` below is a codegen artefact (the JSON-Schema generator emits
 * `Double` for every TypeScript `number`); quantities and counts are discrete, so they are narrowed to `Int`
 * here, at the boundary, and are `Int` everywhere above it.
 */

// ── reads (DTO → domain) ─────────────────────────────────────────────────────────────────────────────

private fun FulfillmentStatus.toDomain(): FulfillmentState = when (this) {
    FulfillmentStatus.Pending -> FulfillmentState.PENDING
    FulfillmentStatus.Received -> FulfillmentState.RECEIVED
    FulfillmentStatus.Picking -> FulfillmentState.PICKING
    FulfillmentStatus.ReadyForPickup -> FulfillmentState.READY_FOR_PICKUP
    FulfillmentStatus.Collected -> FulfillmentState.COLLECTED
}

private fun DeliveryPromiseDTO.toDomain(): DeliveryPromise =
    DeliveryPromise(serviceLevel = serviceLevel, readyBy = readyBy)

private fun FulfillmentDeliveryDTO.toDomain(): DeliveryContext = DeliveryContext(
    recipientName = recipientName,
    line1 = line1,
    line2 = line2,
    city = city,
    region = region,
    postalCode = postalCode,
    country = country,
    phone = phone,
)

private fun FulfillmentItemDTO.toDomain(): FulfillmentItem = FulfillmentItem(
    orderItemId = orderItemID,
    name = name,
    sku = sku,
    imageUrl = imageURL,
    orderedQuantity = orderedQuantity.toInt(),
    gatheredQuantity = gatheredQuantity.toInt(),
    unavailableQuantity = unavailableQuantity.toInt(),
)

internal fun FulfillmentSummaryDTO.toDomain(): FulfillmentSummary = FulfillmentSummary(
    id = id,
    orderNumber = orderNumber,
    placedAt = placedAt,
    status = status.toDomain(),
    stateChangedAt = stateChangedAt,
    itemCount = itemCount.toInt(),
    gatheredCount = gatheredCount.toInt(),
    unavailableCount = unavailableCount.toInt(),
    promise = promise.toDomain(),
    atRisk = atRisk,
)

/**
 * The queue as the backend ordered it — promise-soonest first, tie-broken by arrival (FR-001). The client
 * MUST NOT re-sort: the order is stable precisely because it is decided once, server-side, from two
 * immutable keys, and at-risk work escalates in place rather than jumping the queue (FR-001a).
 */
internal fun FulfillmentQueueDTO.toDomain(): List<FulfillmentSummary> = items.map { it.toDomain() }

internal fun FulfillmentDetailDTO.toDomain(): FulfillmentDetail = FulfillmentDetail(
    id = id,
    orderNumber = orderNumber,
    placedAt = placedAt,
    status = status.toDomain(),
    stateChangedAt = stateChangedAt,
    promise = promise.toDomain(),
    delivery = delivery.toDomain(),
    items = items.map { it.toDomain() },
)

// ── writes (domain → request DTO / query value) ──────────────────────────────────────────────────────

internal fun QueueState.toDto(): FulfillmentQueueState = when (this) {
    QueueState.ACTIVE -> FulfillmentQueueState.Active
    QueueState.COMPLETED -> FulfillmentQueueState.Completed
}

private fun FulfillmentTransition.toDto(): RequestableTransition = when (this) {
    FulfillmentTransition.PICKING -> RequestableTransition.Picking
    FulfillmentTransition.READY_FOR_PICKUP -> RequestableTransition.ReadyForPickup
}

internal fun FulfillmentTransition.toRequest(): TransitionRequest = TransitionRequest(to = toDto())

/** Absolute quantities, never deltas — a null field is simply "leave this one alone" (FR-010a/FR-010d). */
internal fun ItemProgress.toRequest(): ItemProgressRequest = ItemProgressRequest(
    gatheredQuantity = gatheredQuantity?.toDouble(),
    unavailableQuantity = unavailableQuantity?.toDouble(),
)
