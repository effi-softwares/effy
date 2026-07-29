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
 * ⚠ It is also deliberately NOT synced. A guest's device-local choice is not an account record
 * (spec Assumptions), so signing in on another phone starts fresh — which is the intended behaviour,
 * not a gap.
 */
interface DevicePreferences {
    fun getString(key: String): String?

    fun putString(key: String, value: String)

    fun getBoolean(key: String, default: Boolean = false): Boolean

    fun putBoolean(key: String, value: Boolean)
}

/** The keys in use. Central so two features cannot silently pick the same string. */
object PreferenceKeys {
    /** FR-033 — the first-launch introduction has been completed or skipped. */
    const val ONBOARDING_SEEN = "onboarding_seen"

    /** 017 — the chosen appearance (`AppearanceMode.storageValue`). */
    const val APPEARANCE_MODE = "appearance_mode"
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
}
