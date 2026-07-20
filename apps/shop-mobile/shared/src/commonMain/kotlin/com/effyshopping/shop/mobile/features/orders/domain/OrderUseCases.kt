package com.effyshopping.shop.mobile.features.orders.domain

/**
 * The order-fulfillment use cases (020). The ViewModel depends on THESE, not the repository directly — the
 * repo is private to [com.effyshopping.shop.mobile.app.AppContainer]. Each is a thin, named intent over the
 * [OrderRepository] boundary; the interesting logic (shop scoping, the state machine, the concurrency guard)
 * is the backend's, so these stay trivially fakeable.
 */

/** This shop's queue for one slice — active work, or the completed history (FR-016). */
class ListFulfillments(private val repo: OrderRepository) {
    suspend operator fun invoke(state: QueueState): List<FulfillmentSummary> = repo.listFulfillments(state)
}

/**
 * Open one portion for picking. **Acknowledges it** if it was still `pending` (FR-011a) — so this is invoked
 * from a deliberate operator action only, never from a poll or an auto-selection.
 */
class GetFulfillment(private val repo: OrderRepository) {
    suspend operator fun invoke(id: String): FulfillmentDetail = repo.getFulfillment(id)
}

/**
 * Advance the portion, or perform the one permitted reversal back to `picking` (FR-011d). A 409 means the
 * portion moved under the operator — surface it and re-read; never retry (FR-014).
 */
class AdvanceFulfillment(private val repo: OrderRepository) {
    suspend operator fun invoke(id: String, to: FulfillmentTransition): FulfillmentDetail = repo.transition(id, to)
}

/**
 * Record what was gathered and what is short, in ABSOLUTE quantities. Lowering the unavailable quantity to
 * zero is how an item is un-flagged when it turns up (FR-010d). No money moves (FR-010b).
 */
class RecordItemProgress(private val repo: OrderRepository) {
    suspend operator fun invoke(id: String, orderItemId: String, progress: ItemProgress): FulfillmentDetail =
        repo.recordItemProgress(id, orderItemId, progress)
}
