package com.effyshopping.customer.mobile.core.storage

/**
 * A tiny device-local key/value store for PREFERENCES — not for data, and never for secrets.
 *
 * ── Why this exists (026) ───────────────────────────────────────────────────────────────────────
 *
 * The mobile apps had **no persistence at all**. `AppearanceMode` has carried `storageValue` /
 * `fromStorage` tokens since 017, but nothing ever called them — 017 recorded the persisted store as
 * deferred, so a shopper's Light/Dark choice was forgotten on every launch. Onboarding then arrived
 * with a harder requirement: FR-033 says the introduction MUST NOT reappear on subsequent launches,
 * which is impossible without something that outlives the process.
 *
 * ⚠ WHAT MAY GO IN HERE. Device-local, non-sensitive, non-authoritative preferences: has the
 * introduction been seen, which appearance was chosen. **Never** tokens, credentials, customer
 * records, or anything the backend is authoritative for — those have their own homes (the session
 * manager, the repositories) with their own security properties. A key/value blob backed by
 * SharedPreferences / NSUserDefaults is world-readable on a rooted or jailbroken device.
 *
 * ── ⚠ AMENDMENT (027): a non-authoritative MIRROR is now permitted ──────────────────────────────
 *
 * 026's rule above said "never … anything the backend is authoritative for". 027 needs the cart to
 * survive a force-quit, and the cart *is* backend-authoritative once the shopper signs in — so the
 * rule is **narrowly widened**, not quietly broken. A **mirror** of platform data may live here if
 * ALL THREE of the following hold. A mirror that fails any of them is a cache pretending to be a
 * record, and belongs nowhere:
 *
 *   1. It is **reconciled against the platform on read** and discarded the moment the platform
 *      disagrees — the platform's revision wins, always.
 *   2. It is **never an input to an authorization or pricing decision.** 027 FR-027 already requires
 *      the platform to compute every amount that is charged; this store must never be able to change
 *      what a shopper pays or what they may do.
 *   3. It holds **no more than the shopper could already see on screen** — product ids, names,
 *      quantities and prices out of their own cart. Never another person's data, never a token.
 *
 * Entries admitted under this amendment: the cart mirror (`CART_MIRROR`), its pending-change queue
 * (`CART_QUEUE`), and — added by 033 — the guest saved list (`SAVED_GUEST`).
 *
 * ⚠ 033's entry is admitted deliberately, not by precedent, and it satisfies all three tests more
 * easily than the cart does: (1) it is replaced wholesale by the platform's membership answer on
 * every read and discarded on any version mismatch; (2) it is NEVER an input to an authorization or
 * pricing decision — a saved item is an expression of interest and nothing is charged from it, and
 * purchasability is decided server-side per request precisely so this store cannot influence it; and
 * (3) it holds only product ids and the price the shopper was already looking at when they tapped.
 * It is the shopper's own list of things they said they liked. See specs/027-customer-cart-sync/research.md R3 for the sizing
 * argument (a 100-line cart is ≈45 KB, well inside what these platform stores handle) and for why a
 * real embedded database was rejected for ≤200 rows that are always read whole and never queried.
 *
 * ⚠ It is also deliberately NOT synced. A guest's device-local choice is not an account record
 * (spec Assumptions), so signing in on another phone starts fresh — which is the intended behaviour,
 * not a gap. The cart mirror is not an exception to this: it is not *synced by this store*, it is
 * reconciled by the cart's own sync coordinator against the platform.
 */
interface DevicePreferences {
    fun getString(key: String): String?

    fun putString(key: String, value: String)

    fun getBoolean(key: String, default: Boolean = false): Boolean

    fun putBoolean(key: String, value: Boolean)

    /**
     * Forget a key entirely (034 FR-046).
     *
     * ⚠ REMOVE, not "write an empty value". A guest asking to delete their data is owed the data
     * being gone, not blanked — and a key left behind with an empty string is a value the next
     * reader has to remember to treat as absent.
     */
    fun remove(key: String)
}

/** The keys in use. Central so two features cannot silently pick the same string. */
object PreferenceKeys {
    /** FR-033 — the first-launch introduction has been completed or skipped. */
    const val ONBOARDING_SEEN = "onboarding_seen"

    /** 017 — the chosen appearance (`AppearanceMode.storageValue`). */
    const val APPEARANCE_MODE = "appearance_mode"

    /**
     * 027 — the cart mirror: a NON-AUTHORITATIVE snapshot of the cart, reconciled against the
     * platform on read (see the amendment in this file's header). Serialised `CartMirrorEnvelope`.
     */
    const val CART_MIRROR = "cart_mirror"

    /**
     * 027 — the queued cart changes not yet accepted by the platform. Persisted so a change made
     * before a force-quit is still applied on the next launch (FR-017), exactly once (FR-018).
     */
    const val CART_QUEUE = "cart_queue"

    /**
     * 033 — the GUEST saved list, held on this device until the shopper signs in.
     *
     * ⚠ Persisted so a guest's taps survive an app restart (FR-025). Without this the feature's
     * central bet fails silently: usability research is one-sided that the sign-in wall is the single
     * biggest reason saved-item features go unused, so 033 lets a guest save first — but a list that
     * evaporates on the next launch is worse than the wall, because the shopper believes they kept
     * something and did not.
     *
     * ⚠ 030's delivery location is the cautionary tale. Its store was built with a `persist` callback
     * already in place and `AppContainer` passed the no-arg constructor, so the callback was `{}` and
     * nothing was ever written — for a whole feature, invisibly. Serialised `SavedGuestEnvelope`.
     */
    const val SAVED_GUEST = "saved_guest"
}

/**
 * The platform store. Android → `SharedPreferences`, iOS → `NSUserDefaults`.
 *
 * This is an `expect fun` returning an interface rather than an `expect class`, matching the pattern
 * 013 D5 set for `httpEngine()` — the shared module states what it needs, each platform supplies it,
 * and nothing about the platform type leaks into `commonMain`.
 */
expect fun devicePreferences(): DevicePreferences

/** An in-memory implementation for tests and previews — nothing survives the process. */
class InMemoryDevicePreferences : DevicePreferences {
    private val values = mutableMapOf<String, String>()

    override fun getString(key: String): String? = values[key]

    override fun putString(key: String, value: String) {
        values[key] = value
    }

    override fun getBoolean(key: String, default: Boolean): Boolean =
        values[key]?.toBooleanStrictOrNull() ?: default

    override fun putBoolean(key: String, value: Boolean) {
        values[key] = value.toString()
    }

    override fun remove(key: String) {
        values.remove(key)
    }
}

/**
 * Erase everything this device holds for a GUEST (034 FR-046).
 *
 * ⚠ Apple's own FAQ names guest accounts explicitly: *"Users should have the option to delete
 * automatically generated accounts (sometimes called 'guest' accounts) and the data associated with
 * those accounts."* Effy is deliberately guest-first and a guest's saved list survives a restart, so
 * this is not hypothetical.
 *
 * ⚠ THERE IS NOTHING SERVER-SIDE TO ERASE, and that is the whole of it. An Effy guest has no record:
 * the saved list and the cart mirror live here and only become platform data on sign-in. Claiming a
 * server-side deletion would be the inverse of the FR-040 problem — a disclosure describing work that
 * does not happen.
 *
 * The appearance preference is deliberately KEPT: it is a device setting, not personal data, and
 * resetting someone's theme when they asked to clear their shopping data would be a surprise.
 */
fun DevicePreferences.clearGuestData() {
    remove(PreferenceKeys.SAVED_GUEST)
    remove(PreferenceKeys.CART_MIRROR)
    remove(PreferenceKeys.CART_QUEUE)
}

/**
 * Is there anything on this device worth offering to clear?
 *
 * ⚠ This is what keeps the "Clear data on this device" control from appearing when it would do
 * NOTHING. Signing out already clears all of the above, so a just-signed-out shopper was being shown
 * a button whose only possible effect was to clear an empty store — which reads as "the app did not
 * tidy up after me", the opposite of what actually happened.
 */
fun DevicePreferences.hasDeviceShoppingData(): Boolean =
    !getString(PreferenceKeys.SAVED_GUEST).isNullOrBlank() ||
        !getString(PreferenceKeys.CART_MIRROR).isNullOrBlank() ||
        !getString(PreferenceKeys.CART_QUEUE).isNullOrBlank()
