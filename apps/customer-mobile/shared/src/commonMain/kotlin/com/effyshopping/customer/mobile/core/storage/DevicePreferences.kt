package com.effyshopping.customer.mobile.core.storage

/**
 * A tiny device-local key/value store for preferences: has the introduction been seen, which appearance
 * was chosen. Never tokens, credentials, customer records or anything the backend is authoritative for
 * (SharedPreferences / NSUserDefaults are readable on a rooted or jailbroken device).
 *
 * One exception: a mirror of platform data may live here when all three hold:
 *  1. It is reconciled against the platform on read and discarded when the platform disagrees.
 *  2. It is never an input to an authorization or pricing decision.
 *  3. It holds no more than the shopper could already see on screen; never another person's data or a
 *  token.
 * Admitted: the cart mirror (`CART_MIRROR`), its pending-change queue (`CART_QUEUE`) and the guest saved
 * list (`SAVED_GUEST`), each small (a 100-line cart is ≈45 KB) and read whole. Nothing here is synced: the
 * cart mirror is reconciled by the cart's own coordinator.
 */
interface DevicePreferences {
    fun getString(key: String): String?

    fun putString(key: String, value: String)

    fun getBoolean(key: String, default: Boolean = false): Boolean

    fun putBoolean(key: String, value: Boolean)

    /**
     * Forget a key entirely.
     *
     * Remove, not "write an empty value". A guest asking to delete their data is owed the data
     * being gone, not blanked - and a key left behind with an empty string is a value the next
     * reader has to remember to treat as absent.
     */
    fun remove(key: String)
}

/** The keys in use. Central so two features cannot silently pick the same string. */
object PreferenceKeys {
    /** The first-launch introduction has been completed or skipped. */
    const val ONBOARDING_SEEN = "onboarding_seen"

    /**
     * The chosen appearance (`AppearanceMode.storageValue`): Match my phone / Light / Dark. A device
     * setting: clearing shopping data and signing out leave it alone.
     */
    const val APPEARANCE_MODE = "appearance_mode"

    /** The shopper's recent searches on this device (JSON list). Cleared on sign-out. */
    const val RECENT_SEARCHES = "recent_searches"

    /**
     * The cart mirror: a non-authoritative snapshot of the cart, reconciled against the
     * platform on read (see the amendment in this file's header). Serialised `CartMirrorEnvelope`.
     */
    const val CART_MIRROR = "cart_mirror"

    /**
     * The queued cart changes not yet accepted by the platform. Persisted so a change made
     * before a force-quit is still applied on the next launch, exactly once.
     */
    const val CART_QUEUE = "cart_queue"

    /** The guest saved list, held on this device until sign-in, so a guest's saves survive a restart (a serialised `SavedGuestEnvelope`). */
    const val SAVED_GUEST = "saved_guest"
}

/** The platform store (Android `SharedPreferences`, iOS `NSUserDefaults`), as an `expect fun` returning an interface. */
expect fun devicePreferences(): DevicePreferences

/** An in-memory implementation for tests and previews - nothing survives the process. */
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
 * Erase everything this device holds for a guest (app stores require deleting guest data). A guest has no
 * server record, so there is nothing server-side to erase. The appearance preference is kept: a device
 * setting, not personal data.
 */
fun DevicePreferences.clearGuestData() {
    // What someone searched for is personal; a shared phone must not show it to the next person.
    remove(PreferenceKeys.RECENT_SEARCHES)
    remove(PreferenceKeys.SAVED_GUEST)
    remove(PreferenceKeys.CART_MIRROR)
    remove(PreferenceKeys.CART_QUEUE)
}

/**
 * Is there anything on this device worth offering to clear?
 *
 * This is what keeps the "Clear data on this device" control from appearing when it would do
 * nothing. Signing out already clears all of the above, so a just-signed-out shopper was being shown
 * a button whose only possible effect was to clear an empty store - which reads as "the app did not
 * tidy up after me", the opposite of what actually happened.
 */
fun DevicePreferences.hasDeviceShoppingData(): Boolean =
    !getString(PreferenceKeys.RECENT_SEARCHES).isNullOrBlank() ||
        !getString(PreferenceKeys.SAVED_GUEST).isNullOrBlank() ||
        !getString(PreferenceKeys.CART_MIRROR).isNullOrBlank() ||
        !getString(PreferenceKeys.CART_QUEUE).isNullOrBlank()
