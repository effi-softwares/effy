package com.effyshopping.customer.mobile.features.cart.domain

/**
 * The cart port (027, replacing 019's replace-only seam).
 *
 * ── What changed, and why the shape is what it is ───────────────────────────────────────────────
 *
 * 019 R8 "Option B" made the device cart the source of truth and gave this port exactly one method:
 * `replace(lines)`, called once at checkout entry. 027 reverses that (research R0): for a signed-in
 * shopper the PLATFORM is authoritative, so every cart operation is a real call and every one of them
 * returns the COMPLETE re-priced cart — the client never has to guess an outcome or follow up with a read
 * (FR-007).
 *
 * ⚠ There is no `replace` any more, deliberately. A whole-cart replace is the one operation that lets a
 * device delete a line it has never heard of, and its absence is what makes a week-stale device
 * structurally harmless (FR-010). What replaced it is [merge] — union with MAXIMUM quantity, which loses
 * nothing and is idempotent.
 *
 * Every mutation takes a `changeId`: minted once per shopper action, reused by every retry, so a request
 * that arrived without its response reaching us cannot apply twice (FR-018).
 *
 * Behind an interface (Principle VI) so the HTTP implementation stays out of the presentation layer and
 * the whole flow is unit-testable with a fake.
 */
interface CartRepository {

    /** The account cart, re-priced. */
    suspend fun get(): CartSnapshot

    /**
     * Add or INCREMENT a line — the one non-idempotent operation, which is why `changeId` is not optional
     * anywhere in this port and is load-bearing here.
     */
    suspend fun add(productId: String, quantity: Int, changeId: String): CartSnapshot

    /** Set an ABSOLUTE quantity; 0 removes. Absolute is what makes debouncing ten taps safe. */
    suspend fun setQuantity(productId: String, quantity: Int, changeId: String): CartSnapshot

    suspend fun remove(productId: String, changeId: String): CartSnapshot

    /** Empty the payable cart. Set-aside items survive it (FR-030/FR-032). */
    suspend fun clear(changeId: String): CartSnapshot

    /**
     * Fold the device cart into the account cart at sign-in: union with MAXIMUM quantity per product, so
     * nothing is lost from either side and signing in twice changes nothing (FR-011/FR-012).
     */
    suspend fun merge(lines: List<PendingLine>, changeId: String): CartSnapshot

    /** Add every still-available item of a past order back to the cart, reporting what could not come. */
    suspend fun reorder(orderId: String, changeId: String): ReorderOutcome

    suspend fun setAside(productId: String, changeId: String): CartSnapshot

    /** Move a set-aside line back into the cart, at its CURRENT price (FR-029). */
    suspend fun restoreSaved(productId: String, changeId: String): CartSnapshot

    suspend fun deleteSaved(productId: String, changeId: String): CartSnapshot

    /** Apply a promotional code. The platform decides validity and worth — never this client (FR-042). */
    suspend fun applyPromo(code: String): CartSnapshot

    /** Remove the applied code. */
    suspend fun removePromo(): CartSnapshot

    /**
     * Re-price a set of lines WITHOUT writing anything — the guest path. A guest has no account cart, but
     * still deserves current prices and honest availability when their cart is restored (FR-004).
     */
    suspend fun preview(lines: List<PendingLine>): CartSnapshot

    /** The public order rules, so a guest cart can gate and explain from the platform's own numbers. */
    suspend fun policy(): CartPolicy
}
