package com.effyshopping.customer.mobile.features.cart.domain

/**
 * The server-cart merge port (019 US3). The checkout ViewModel folds the device-local guest cart into the
 * authoritative server cart on sign-in via this seam. Behind an interface (Principle VI) so the data-layer
 * HTTP implementation stays out of the presentation layer and the flow is unit-testable with a fake.
 */
interface CartMergeRepository {
    /** Merge the guest cart into the server cart (sums quantities per product). Best-effort; idempotent. */
    suspend fun merge(lines: List<GuestCartLine>)
}
