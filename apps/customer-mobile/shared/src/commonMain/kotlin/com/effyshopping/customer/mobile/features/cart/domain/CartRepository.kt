package com.effyshopping.customer.mobile.features.cart.domain

/**
 * The cart port. For a signed-in shopper the platform is authoritative: every operation is a real call
 * returning the complete re-priced cart. There is no whole-cart `replace`, the one operation that would
 * let a stale device delete a line it never heard of; [merge] is union with maximum quantity, lossless and
 * idempotent. Every mutation takes a `changeId` minted once per shopper action and reused on retry, so a
 * request whose response was lost cannot apply twice.
 */
interface CartRepository {

    /** The account cart, re-priced. */
    suspend fun get(): CartSnapshot

    /**
     * Add or increment a line - the one non-idempotent operation, which is why `changeId` is not optional
     * anywhere in this port and is load-bearing here.
     */
    suspend fun add(variantId: String, quantity: Int, changeId: String): CartSnapshot

    /** Set an absolute quantity; 0 removes. Absolute is what makes debouncing ten taps safe. */
    suspend fun setQuantity(variantId: String, quantity: Int, changeId: String): CartSnapshot

    suspend fun remove(variantId: String, changeId: String): CartSnapshot

    /** Empty the payable cart. Set-aside items survive it. */
    suspend fun clear(changeId: String): CartSnapshot

    /**
     * Fold the device cart into the account cart at sign-in: union with maximum quantity per product, so
     * nothing is lost from either side and signing in twice changes nothing.
     */
    suspend fun merge(lines: List<PendingLine>, changeId: String): CartSnapshot

    /** Add every still-available item of a past order back to the cart, reporting what could not come. */
    suspend fun reorder(orderId: String, changeId: String): ReorderOutcome

    suspend fun setAside(variantId: String, changeId: String): CartSnapshot

    /** Move a set-aside line back into the cart, at its current price. */
    suspend fun restoreSaved(variantId: String, changeId: String): CartSnapshot

    suspend fun deleteSaved(variantId: String, changeId: String): CartSnapshot

    /** Apply a promotional code. The platform decides validity and worth - never this client. */
    suspend fun applyPromo(code: String): CartSnapshot

    /** Remove the applied code. */
    suspend fun removePromo(): CartSnapshot

    /**
     * Re-price a set of lines without writing anything - the guest path. A guest has no account cart, but
     * still deserves current prices and honest availability when their cart is restored.
     */
    suspend fun preview(lines: List<PendingLine>): CartSnapshot

    /** The public order rules, so a guest cart can gate and explain from the platform's own numbers. */
    suspend fun policy(): CartPolicy
}
