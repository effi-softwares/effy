package com.effyshopping.customer.mobile.features.delivery

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Where the shopper wants their order delivered (025 US1 / FR-012, FR-013) — the mobile half of the
 * web `lib/delivery-store.ts`.
 *
 * The gap it closes: a shopper could browse the whole catalogue, fill a cart, sign in, and only THEN
 * discover Effy does not deliver to them. The platform has known delivery zones since 021; it simply
 * never told anyone until checkout.
 *
 * ── ⚠ Persistence is a SEAM, not yet a mechanism ────────────────────────────────────────────────
 *
 * FR-013 asks for the location to survive across visits. On web that is `localStorage`. This app has
 * **no key-value persistence at all** — sessions live in Amplify, and `multiplatform-settings` is a
 * shop-mobile dependency that customer-mobile does not have. Adding it would breach this feature's
 * "no new runtime dependency" constraint for a presentation slice.
 *
 * So the store is built exactly like shop-mobile's `AppearancePreferenceStore`: an injected
 * `initialValue` and a `persist` callback, defaulting to in-memory. Wiring real persistence is then a
 * constructor argument, not a rewrite.
 *
 * **Honest status**: within a session the location holds; across app restarts it does not, on this
 * surface only. Web meets FR-013 in full.
 */
class DeliveryContextStore internal constructor(
    initialPostcode: String?,
    private val persist: (String?) -> Unit = {},
) {
    constructor() : this(initialPostcode = null)

    private val mutableState = MutableStateFlow(
        initialPostcode?.let { DeliveryContext(postcode = it, serviced = null, source = DeliverySource.GUEST) },
    )
    val state: StateFlow<DeliveryContext?> = mutableState.asStateFlow()

    /**
     * Set the location. Returns the normalised postcode, or null when the input is not a postcode.
     *
     * `serviced` resets to null so the UI shows "checking…" rather than briefly showing the PREVIOUS
     * postcode's answer against the new one.
     */
    fun setPostcode(raw: String, source: DeliverySource = DeliverySource.GUEST): String? {
        val postcode = normalizePostcode(raw) ?: return null
        mutableState.value = DeliveryContext(postcode = postcode, serviced = null, source = source)
        persist(postcode)
        return postcode
    }

    /**
     * Record a serviceability answer.
     *
     * Ignored when it arrives for a postcode the shopper has already moved away from — type "3000",
     * correct it to "3001", and the slow 3000 response must not land on 3001.
     */
    fun recordServiceability(postcode: String, serviced: Boolean) {
        val current = mutableState.value ?: return
        if (current.postcode != postcode) return
        mutableState.value = current.copy(serviced = serviced)
    }

    fun clear() {
        mutableState.value = null
        persist(null)
    }

    /**
     * Seed from the signed-in shopper's default address, but only when nothing is set.
     *
     * An explicit choice on this device outranks a saved default.
     */
    fun seedFromAccount(postcode: String) {
        if (mutableState.value != null) return
        setPostcode(postcode, DeliverySource.ACCOUNT)
    }
}

/** How the stored location was arrived at. Display provenance only — never an authorization input. */
enum class DeliverySource { GUEST, ACCOUNT }

data class DeliveryContext(
    val postcode: String,
    /**
     * Whether Effy delivers to [postcode].
     *
     * ⚠ `null` means "we have not got an answer" — NOT "no". The UI must never render the two the
     * same way: telling a prospective customer Effy refuses to serve them because a request failed is
     * the outcome this whole capability exists to prevent.
     */
    val serviced: Boolean?,
    val source: DeliverySource,
)

/**
 * Reduce input to the canonical stored form, or reject it.
 *
 * ⚠ Must agree exactly with `delivery.NormalizePostcode` on the hot path and `normalizePostcode` on
 * web. Separators are tolerated only BETWEEN digits: without that rule "-1000" strips to "1000" and
 * the shopper is answered about a postcode they never entered.
 */
fun normalizePostcode(raw: String): String? {
    val trimmed = raw.trim()
    if (trimmed.length < 2) return null
    if (!trimmed.first().isDigit() || !trimmed.last().isDigit()) return null
    val stripped = trimmed.filterNot { it == ' ' || it == '-' || it == '\t' }
    return if (stripped.length == 4 && stripped.all { it.isDigit() }) stripped else null
}
