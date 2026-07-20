package com.effyshopping.shop.mobile.features.orders.domain

/**
 * The order-fulfillment boundary (020 US1–US4). Everything goes to `edge-api/shop` with the single
 * access-token bearer (014 D2s). The shop identifier is resolved SERVER-SIDE from the caller's `shop_staff`
 * record and is **never accepted as input** — there is no shop parameter anywhere in this interface, and
 * that absence is the client half of FR-019/SC-007.
 *
 * Implementations map wire DTOs to the pure domain and never let a DTO escape; transport + non-2xx failures
 * surface as `AppException` (a closed `AppError`).
 *
 * **A portion is never `NotFound`.** The backend answers "no such portion" and "another shop's portion" with
 * the same uniform 403 → `AppError.Forbidden`, deliberately, so the client cannot be used as an oracle for
 * enumerating other shops' orders. Do not reintroduce a 404 branch here.
 */
interface OrderRepository {
    /** `GET /shop/v1/fulfillments?state=` — this shop's queue, promise-ordered (soonest first), FR-001. */
    suspend fun listFulfillments(state: QueueState): List<FulfillmentSummary>

    /**
     * `GET /shop/v1/fulfillments/{id}` — the pick screen.
     *
     * **This read has a side effect by design**: a `pending` portion becomes `received`, because opening it
     * IS the acknowledgement (FR-011a). Never call it speculatively (prefetch, auto-select, poll) — doing so
     * would acknowledge work no human has looked at.
     */
    suspend fun getFulfillment(id: String): FulfillmentDetail

    /**
     * `POST /shop/v1/fulfillments/{id}/status` — advance or reverse the portion (FR-011/FR-011d).
     * An illegal transition from the current state is a 409 → `AppError.Conflict`: someone else moved it.
     */
    suspend fun transition(id: String, to: FulfillmentTransition): FulfillmentDetail

    /**
     * `PATCH /shop/v1/fulfillments/{id}/items/{orderItemId}` — record picking progress and shortfall.
     * Values are ABSOLUTE (idempotent under retry); legal only while the portion is `picking`.
     */
    suspend fun recordItemProgress(id: String, orderItemId: String, progress: ItemProgress): FulfillmentDetail
}
