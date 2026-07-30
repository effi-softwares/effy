package com.effyshopping.customer.mobile.features.cart.data

import com.effyshopping.customer.mobile.core.storage.DevicePreferences
import com.effyshopping.customer.mobile.core.storage.PreferenceKeys
import com.effyshopping.customer.mobile.features.cart.domain.CartSnapshot
import com.effyshopping.customer.mobile.features.cart.domain.PendingChange
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Where the cart survives a force-quit (027 US1, FR-001/FR-002).
 *
 * ── The defect this closes ──────────────────────────────────────────────────────────────────────
 *
 * Before this, `GuestCartStore` was a `MutableStateFlow` and nothing else. Every decision a shopper made
 * lived only for the lifetime of the process: switch apps for long enough, or close the app, and the whole
 * cart was gone with no warning and no way back. On the web storefront it at least survived in one
 * browser. On mobile it survived nothing.
 *
 * ── What is stored, and the rule it lives under ─────────────────────────────────────────────────
 *
 * The mirror ([CartSnapshot]) and the pending-change queue, together, as one JSON blob per key. Together
 * matters: a mirror without its queue would show a change the app has forgotten to send, and a queue
 * without its mirror would send changes the shopper can no longer see.
 *
 * This is a NON-AUTHORITATIVE mirror, permitted under the amendment in `DevicePreferences`' header on
 * three conditions — reconciled on read, never an input to pricing or authorization, and holding no more
 * than the shopper already sees in their own cart. All three hold here. It is not a substitute for the
 * platform; it is what makes a tap land in under 100 ms and a cold launch show something true.
 *
 * ⚠ EVERY read is defensive. A blob written by an older build, a truncated write, or hand-edited
 * preferences must produce an EMPTY cart, never a crash and never a half-parsed one — losing a cart is
 * bad, but a launch crash loop is worse, and a silently mangled cart is worst of all because the shopper
 * would trust it. [SCHEMA_VERSION] is bumped whenever the stored shape changes, and a mismatch discards.
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
         * Bump whenever the stored shape changes. A mismatch discards rather than migrates: a cart is
         * cheap to rebuild compared with the cost of getting a migration subtly wrong, and the shopper
         * sees an empty cart rather than a wrong one.
         */
        const val SCHEMA_VERSION = 1

        /**
         * `ignoreUnknownKeys` is deliberate ON TOP of the version check. The version catches a shape we
         * changed; this catches a field a NEWER build wrote that this one has never heard of — which
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
