package com.effyshopping.customer.mobile.features.cart.domain

/**
 * The server-cart port (019 US3, R8 amended → Option B). The device-local [GuestCartStore] is the SOURCE
 * OF TRUTH; at checkout the ViewModel snapshots it to the server cart through this seam so the delivery
 * quote and pay intent price the exact lines the customer sees. Behind an interface (Principle VI) so the
 * HTTP implementation stays out of the presentation layer and the flow is unit-testable with a fake.
 */
interface CartRepository {
    /**
     * Replace the server cart with EXACTLY these lines (PUT /v1/cart). IDEMPOTENT — re-sending the same
     * lines is a no-op and dropped lines are removed — so re-entering checkout can never accumulate
     * quantities or resurface a stale line from an abandoned attempt. Best-effort at the call site.
     */
    suspend fun replace(lines: List<GuestCartLine>)
}
