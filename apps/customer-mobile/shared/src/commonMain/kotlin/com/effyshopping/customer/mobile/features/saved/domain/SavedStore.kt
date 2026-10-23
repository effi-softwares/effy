package com.effyshopping.customer.mobile.features.saved.domain

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The device's mirror of which products are saved, the one source every save control reads, so a saved
 * product shows as saved and two hearts for one product agree. Like CartStore: one observable state,
 * optimistic edits to the mirror first, reverted if the platform refuses. A guest's [guestEntries] are
 * hydrated from disk before the first frame and written on every edit.
 */
class SavedStore(
    private val local: GuestPersistence = GuestPersistence.None,
) {

    private val _saved = MutableStateFlow<Set<String>>(emptySet())
    val saved: StateFlow<Set<String>> = _saved.asStateFlow()

    /**
     * The saved products held in a list the shopper named.
     *
     * In memory only. A guest has no named lists, so nothing about lists is ever written to the
     * device; and an empty set is the safe reading, because the platform refuses the un-save anyway.
     */
    private val _named = MutableStateFlow<Set<String>>(emptySet())
    val named: StateFlow<Set<String>> = _named.asStateFlow()

    /** Whether a tap on this product's filled heart must open the list chooser instead of un-saving. */
    fun isInNamedList(productId: String): Boolean = productId in _named.value

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
     * Adopting a set wholesale rather than merging is correct here and would be wrong for the cart:
     * the platform is authoritative for membership, there is no local-only state to preserve, and a
     * merge would resurrect items the shopper removed on another device.
     */
    fun adopt(membership: SavedMembership) {
        _saved.value = membership.productIds
        _named.value = membership.namedProductIds
        // The account is now the record. The device copy has served its purpose and must not linger
        // a shared device would otherwise hand the next person the previous shopper's interests.
        if (guest.isNotEmpty()) {
            guest = emptyList()
            local.clear()
        }
    }

    /** Apply an intent to the mirror immediately, before the platform is told. */
    fun apply(productId: String, saved: Boolean) {
        _saved.value = if (saved) _saved.value + productId else _saved.value - productId
    }

    /**
     * Apply a guest's intent and persist it.
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

    /** How many the guest currently holds — the cap is checked against this. */
    fun guestCount(): Int = guest.size

    /**
     * Revert a single product to [previous] after a refusal.
     *
     * Reverts one product, never the whole set. Restoring a snapshot of the entire mirror would
     * undo unrelated taps the shopper made while this request was in flight.
     */
    fun revert(productId: String, previous: Boolean) = apply(productId, previous)

    /** Sign-out: an account's saved items must not stay readable on the device. */
    fun reset() {
        _saved.value = emptySet()
        _named.value = emptySet()
        guest = emptyList()
        local.clear()
    }
}

/**
 * The disk seam: an interface, so the domain depends on nothing and tests use a real in-memory store. [None]
 * is the no-op for a store with no device behind it; check which persistence a new `SavedStore` gets.
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
