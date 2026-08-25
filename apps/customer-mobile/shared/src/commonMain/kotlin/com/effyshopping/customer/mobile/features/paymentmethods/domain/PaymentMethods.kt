package com.effyshopping.customer.mobile.features.paymentmethods.domain

/**
 * Payment methods domain (051 US6) — the cards a shopper chose to keep.
 *
 * ⚠ NOTHING HERE IS STORED ON THE DEVICE, and there is deliberately no field that could hold a card
 * number, a security code or a cardholder name (FR-025 / SC-012). `last4` is the only part of a card
 * number permitted to leave the provider at all.
 *
 * ⚠ Read live, never cached. A card removed at the provider, expired, or replaced by the issuer's
 * auto-updater would keep being offered from a stale copy, which is exactly what makes FR-023
 * unmeetable (data-model § 2).
 */
data class KeptCard(
    val id: String,
    val brand: String,
    val last4: String,
    val expMonth: Long,
    val expYear: Long,
    val isDefault: Boolean,
    /** ⚠ Server-computed. The client must not decide usability from the expiry (FR-023). */
    val usable: Boolean,
    /** Why it cannot be used, when it cannot. Stated, never left for the shopper to work out. */
    val unusableReason: String?,
)

interface PaymentMethodsRepository {
    /**
     * The shopper's kept cards.
     *
     * ⚠ An empty list means "no kept cards". A FAILURE must throw rather than return empty — "you have
     * no cards" and "we could not ask" are different facts, and answering the second with the first is
     * a false statement about the shopper's own account (FR-036).
     */
    suspend fun list(): List<KeptCard>

    /** Remove a kept card. Idempotent from the shopper's point of view: already-gone is success. */
    suspend fun remove(id: String)
}

/** ListPaymentMethods — the use case the ViewModel calls on open (Principle VI). */
class ListPaymentMethods(private val repo: PaymentMethodsRepository) {
    suspend operator fun invoke(): List<KeptCard> = repo.list()
}

/** RemovePaymentMethod — detaching a card the shopper no longer wants Effy to hold. */
class RemovePaymentMethod(private val repo: PaymentMethodsRepository) {
    suspend operator fun invoke(id: String) = repo.remove(id)
}
