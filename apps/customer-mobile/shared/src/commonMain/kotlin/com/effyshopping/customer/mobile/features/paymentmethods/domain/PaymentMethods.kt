package com.effyshopping.customer.mobile.features.paymentmethods.domain

/**
 * The cards a shopper chose to keep. Nothing is stored on the device, and no field could hold a card
 * number, security code or cardholder name (`last4` only). Read live, never cached, so a card removed,
 * expired or replaced at the provider is never offered from a stale copy.
 */
data class KeptCard(
    val id: String,
    val brand: String,
    val last4: String,
    val expMonth: Long,
    val expYear: Long,
    val isDefault: Boolean,
    /** Server-computed. The client must not decide usability from the expiry. */
    val usable: Boolean,
    /** Why it cannot be used, when it cannot. Stated, never left for the shopper to work out. */
    val unusableReason: String?,
)

interface PaymentMethodsRepository {
    /**
     * The shopper's kept cards.
     *
     * An empty list means "no kept cards". A failure must throw rather than return empty — "you have
     * no cards" and "we could not ask" are different facts, and answering the second with the first is
     * a false statement about the shopper's own account.
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
