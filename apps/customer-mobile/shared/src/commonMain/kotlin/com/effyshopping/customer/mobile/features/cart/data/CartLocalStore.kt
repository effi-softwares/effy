package com.effyshopping.customer.mobile.features.cart.data

import com.effyshopping.customer.mobile.core.storage.DevicePreferences
import com.effyshopping.customer.mobile.core.storage.PreferenceKeys
import com.effyshopping.customer.mobile.features.cart.domain.CartSnapshot
import com.effyshopping.customer.mobile.features.cart.domain.PendingChange
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Where the cart survives a force-quit: the mirror ([CartSnapshot]) and the pending-change queue as one
 * JSON blob, together (a mirror without its queue shows a change the app forgot to send; a queue without
 * its mirror sends changes the shopper cannot see). A non-authoritative mirror under the rules in
 * `DevicePreferences`' header.
 *
 * Every read is defensive: an old build's blob, a truncated write or edited preferences produce an empty
 * cart, never a crash or a half-parsed one. [SCHEMA_VERSION] is bumped whenever the stored shape changes;
 * a mismatch discards.
 */
class CartLocalStore(private val prefs: DevicePreferences) {

    /** What was on disk: the mirror and the changes that had not yet reached the platform. */
    data class Loaded(val cart: CartSnapshot, val queue: List<PendingChange>)

    /**
     * Read the persisted cart. Returns null when there is nothing usable — no blob, an unknown version, or
     * anything that fails to parse. The caller starts empty in every one of those cases.
     */
    fun load(): Loaded? {
        val cart = decodeCart() ?: return null
        // A queue that fails to parse must not take the mirror with it: the shopper's cart is worth more
        // than the un-sent changes, and dropping the queue only costs a re-send at worst.
        return Loaded(cart = cart, queue = decodeQueue())
    }

    /** Persist the mirror and the queue. Called on every change, coalesced by the caller. */
    fun save(cart: CartSnapshot, queue: List<PendingChange>) {
        runCatching {
            prefs.putString(PreferenceKeys.CART_MIRROR, json.encodeToString(CartEnvelope(SCHEMA_VERSION, cart)))
            prefs.putString(PreferenceKeys.CART_QUEUE, json.encodeToString(QueueEnvelope(SCHEMA_VERSION, queue)))
        }
        // A failed write is not worth crashing over: the in-memory mirror is still correct for this
        // session, and the next change tries again.
    }

    /** Forget everything — used on sign-out, where the device must not keep an account's cart. */
    fun clear() {
        runCatching {
            prefs.putString(PreferenceKeys.CART_MIRROR, "")
            prefs.putString(PreferenceKeys.CART_QUEUE, "")
        }
    }

    private fun decodeCart(): CartSnapshot? {
        val raw = prefs.getString(PreferenceKeys.CART_MIRROR)?.takeIf { it.isNotBlank() } ?: return null
        val envelope = runCatching { json.decodeFromString<CartEnvelope>(raw) }.getOrNull() ?: return null
        if (envelope.version != SCHEMA_VERSION) return null
        return envelope.cart
    }

    private fun decodeQueue(): List<PendingChange> {
        val raw = prefs.getString(PreferenceKeys.CART_QUEUE)?.takeIf { it.isNotBlank() } ?: return emptyList()
        val envelope = runCatching { json.decodeFromString<QueueEnvelope>(raw) }.getOrNull() ?: return emptyList()
        if (envelope.version != SCHEMA_VERSION) return emptyList()
        return envelope.changes
    }

    companion object {
        /**
         * Bump whenever the stored shape changes; a mismatch discards rather than migrates (an empty cart,
         * never a wrong one). 2: a line is a variant (`variantId`).
         */
        const val SCHEMA_VERSION = 2

        /**
         * `ignoreUnknownKeys` is deliberate on top of the version check. The version catches a shape we
         * changed; this catches a field a newer build wrote that this one has never heard of — which
         * happens on a downgrade, and should cost a field, not the cart.
         */
        private val json = Json {
            ignoreUnknownKeys = true
            encodeDefaults = true
        }
    }
}

@Serializable
private data class CartEnvelope(val version: Int, val cart: CartSnapshot)

@Serializable
private data class QueueEnvelope(val version: Int, val changes: List<PendingChange>)
