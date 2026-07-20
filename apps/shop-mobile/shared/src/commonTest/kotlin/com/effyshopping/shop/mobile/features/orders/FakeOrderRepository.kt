package com.effyshopping.shop.mobile.features.orders

import com.effyshopping.shop.mobile.core.error.AppError
import com.effyshopping.shop.mobile.core.error.AppException
import com.effyshopping.shop.mobile.features.orders.domain.DeliveryContext
import com.effyshopping.shop.mobile.features.orders.domain.DeliveryPromise
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentDetail
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentItem
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentState
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentSummary
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentTransition
import com.effyshopping.shop.mobile.features.orders.domain.ItemProgress
import com.effyshopping.shop.mobile.features.orders.domain.OrderRepository
import com.effyshopping.shop.mobile.features.orders.domain.QueueState

/**
 * A hand-written fake (the mobile test posture — no mocking library). It records the last arguments each
 * boundary method received, so the tests can assert what actually crossed the repository seam — in
 * particular that item progress leaves the client as an ABSOLUTE quantity — and can be told to fail
 * specific calls (the 409 path).
 */
class FakeOrderRepository(
    var queue: List<FulfillmentSummary> = listOf(sampleSummary()),
    var detail: FulfillmentDetail = sampleDetail(),
) : OrderRepository {
    var lastState: QueueState? = null
    var lastDetailId: String? = null
    var lastTransition: FulfillmentTransition? = null
    var lastProgress: ItemProgress? = null
    var lastProgressItemId: String? = null

    var listCalls = 0
    var detailCalls = 0

    var failListWith: AppError? = null
    var failDetailWith: AppError? = null
    var failTransitionWith: AppError? = null
    var failProgressWith: AppError? = null

    override suspend fun listFulfillments(state: QueueState): List<FulfillmentSummary> {
        lastState = state
        listCalls++
        failListWith?.let { throw AppException(it) }
        return queue
    }

    override suspend fun getFulfillment(id: String): FulfillmentDetail {
        lastDetailId = id
        detailCalls++
        failDetailWith?.let { throw AppException(it) }
        return detail
    }

    override suspend fun transition(id: String, to: FulfillmentTransition): FulfillmentDetail {
        lastTransition = to
        failTransitionWith?.let { throw AppException(it) }
        detail = detail.copy(
            status = when (to) {
                FulfillmentTransition.PICKING -> FulfillmentState.PICKING
                FulfillmentTransition.READY_FOR_PICKUP -> FulfillmentState.READY_FOR_PICKUP
            },
        )
        return detail
    }

    override suspend fun recordItemProgress(
        id: String,
        orderItemId: String,
        progress: ItemProgress,
    ): FulfillmentDetail {
        lastProgressItemId = orderItemId
        lastProgress = progress
        failProgressWith?.let { throw AppException(it) }
        detail = detail.copy(
            items = detail.items.map { item ->
                if (item.orderItemId != orderItemId) {
                    item
                } else {
                    item.copy(
                        gatheredQuantity = progress.gatheredQuantity ?: item.gatheredQuantity,
                        unavailableQuantity = progress.unavailableQuantity ?: item.unavailableQuantity,
                    )
                }
            },
        )
        return detail
    }
}

fun samplePromise(): DeliveryPromise =
    DeliveryPromise(serviceLevel = "standard", readyBy = "2026-07-20T03:14:05Z")

fun sampleSummary(
    id: String = "f1",
    status: FulfillmentState = FulfillmentState.PENDING,
    atRisk: Boolean = false,
): FulfillmentSummary = FulfillmentSummary(
    id = id,
    orderNumber = "EFY-10023",
    placedAt = "2026-07-20T02:14:05Z",
    status = status,
    stateChangedAt = "2026-07-20T02:15:11Z",
    itemCount = 4,
    gatheredCount = 0,
    unavailableCount = 0,
    promise = samplePromise(),
    atRisk = atRisk,
)

fun sampleDetail(
    id: String = "f1",
    status: FulfillmentState = FulfillmentState.PICKING,
): FulfillmentDetail = FulfillmentDetail(
    id = id,
    orderNumber = "EFY-10023",
    placedAt = "2026-07-20T02:14:05Z",
    status = status,
    stateChangedAt = "2026-07-20T02:15:11Z",
    promise = samplePromise(),
    delivery = DeliveryContext(
        recipientName = "A Customer",
        line1 = "1 Test Street",
        line2 = null,
        city = "Melbourne",
        region = "VIC",
        postalCode = "3000",
        country = "AU",
    ),
    items = listOf(
        FulfillmentItem(
            orderItemId = "oi-1",
            name = "SunRice Long Grain White Rice 1kg",
            sku = "S2-007",
            orderedQuantity = 2,
            gatheredQuantity = 1,
            unavailableQuantity = 0,
        ),
        FulfillmentItem(
            orderItemId = "oi-2",
            name = "Barilla Spaghetti No.5 500g",
            sku = "S2-011",
            orderedQuantity = 1,
            gatheredQuantity = 0,
            unavailableQuantity = 0,
        ),
    ),
)
