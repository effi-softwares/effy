package com.effyshopping.customer.mobile.features.saved.domain

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The device's mirror of which products are saved — the single source every save control reads.
 *
 * ⚠ THIS IS THE FIX FOR THE DEFECT THE WHOLE SLICE EXISTS FOR. Before it, nothing on the platform
 * could answer "is this product already saved?", so every surface assumed NOT SAVED on every render.
 * A shopper who saved something yesterday opened it today, saw an empty heart, tapped it (a no-op),
 * tapped again — and silently un-saved the thing they were trying to save.
 *
 * Every control subscribes to [saved] rather than holding its own boolean, which is what stops two
 * controls for the same product on one screen from disagreeing (FR-013).
 *
 * Design follows CartStore (027): one observable state object, optimistic edits applied to the mirror
 * FIRST and sent second, and the mirror reverted if the platform refuses.
 *
 * ⚠ A GUEST'S TAPS ARE PERSISTED (FR-025). [guestEntries] is hydrated from disk at construction —
 * before the first frame — and written on every edit, WITHOUT a sign-in check. A list that evaporated
 * on the next launch would be worse than the sign-in wall this feature removes, because the shopper
 * would believe they had kept something.
 */
class SavedStore(
    private val local: GuestPersistence = GuestPersistence.None,
) {

    private val _saved = MutableStateFlow<Set<String>>(emptySet())
    val saved: StateFlow<Set<String>> = _saved.asStateFlow()

    /** The guest's device-held entries, carrying what a merge needs. Empty once signed in and merged. */
    private var guest: List<SavedGuestEntry> = local.load()

    init {
        // Hydrate the visible mirror from disk before anything renders.
        if (guest.isNotEmpty()) _saved.value = guest.map { it.productId }.toSet()
    }

    /** The device-held entries, for the sign-in merge. */
    fun guestEntries(): List<SavedGuestEntry> = guest

    /** Whether a product is saved, for a control rendering right now. */
    fun isSaved(productId: String): Boolean = productId in _saved.value

    /**
     * Replace the mirror with the platform's answer.
     *
     * ⚠ Adopting a set WHOLESALE rather than merging is correct here and would be wrong for the cart:
     * the platform is authoritative for membership, there is no local-only state to preserve, and a
     * merge would resurrect items the shopper removed on another device.
     */
    fun adopt(membership: SavedMembership) {
        _saved.value = membership.productIds
        // The account is now the record. The device copy has served its purpose and must not linger —
        // a shared device would otherwise hand the next person the previous shopper's interests.
        if (guest.isNotEmpty()) {
            guest = emptyList()
            local.clear()
        }
    }

    /** Apply an intent to the mirror immediately, before the platform is told (FR-012). */
    fun apply(productId: String, saved: Boolean) {
        _saved.value = if (saved) _saved.value + productId else _saved.value - productId
    }

    /**
     * Apply a GUEST's intent and persist it.
     *
     * [savedPriceAmount] is null when the surface did not know a price. It is left absent rather than
     * defaulted, so the merge falls back to the product's real current price instead of claiming the
     * item fell from nothing.
     */
    fun applyGuest(
        productId: String,
        saved: Boolean,
        savedPriceAmount: String? = null,
        savedCurrency: String? = null,
        savedAt: String,
    ) {
        apply(productId, saved)
        guest = if (saved) {
            if (guest.any { it.productId == productId }) guest
            else listOf(SavedGuestEntry(productId, savedPriceAmount, savedCurrency, savedAt)) + guest
        } else {
            guest.filterNot { it.productId == productId }
        }
        local.save(guest)
    }

    /** How many the guest currently holds — the cap is checked against this (FR-046). */
    fun guestCount(): Int = guest.size

    /**
     * Revert a single product to [previous] after a refusal.
     *
     * ⚠ Reverts ONE product, never the whole set. Restoring a snapshot of the entire mirror would
     * undo unrelated taps the shopper made while this request was in flight.
     */
    fun revert(productId: String, previous: Boolean) = apply(productId, previous)

    /** Sign-out: an account's saved items must not stay readable on the device (FR-031). */
    fun reset() {
        _saved.value = emptySet()
        guest = emptyList()
        local.clear()
    }
}


/**
 * The disk seam.
 *
 * ⚠ An interface rather than a direct `SavedLocalStore` dependency, so the domain layer keeps
 * depending on nothing (Principle VI) and tests get a real in-memory implementation instead of a
 * mock. [None] is the deliberate no-op for a store with no device behind it.
 *
 * ⚠ 030's trap lives here: its store had exactly this seam and `AppContainer` passed the no-op, so
 * nothing was ever written for an entire feature. If you add a `SavedStore()` call, check which
 * persistence it got.
 */
interface GuestPersistence {
    fun load(): List<SavedGuestEntry>
    fun save(items: List<SavedGuestEntry>)
    fun clear()

    object None : GuestPersistence {
        override fun load(): List<SavedGuestEntry> = emptyList()
        override fun save(items: List<SavedGuestEntry>) = Unit
        override fun clear() = Unit
    }
}
