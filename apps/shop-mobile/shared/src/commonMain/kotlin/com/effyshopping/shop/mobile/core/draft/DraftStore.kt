package com.effyshopping.shop.mobile.core.draft

import com.russhwolf.settings.Settings

/**
 * A device-LOCAL, single-slot draft store (016 FR-012). The in-progress create form is persisted on the
 * device so an operator can back out, get interrupted, and resume — it is NEVER synced to the backend (a
 * draft product is created only on publish). One string slot is enough: the feature serializes its whole
 * draft to JSON and hands it here.
 *
 * A plain interface (no expect/actual in the app) keeps it trivially fakeable in `commonTest`; the
 * production binding ([SettingsDraftStore]) is wired once in `AppContainer`, and an [InMemoryDraftStore]
 * backs both tests and any platform where key-value persistence is unavailable.
 */
interface DraftStore {
    /** The persisted draft JSON, or null if none. */
    fun read(): String?

    /** Persist (overwrite) the draft JSON. */
    fun write(value: String)

    /** Discard the draft (on publish or explicit discard). */
    fun clear()
}

/** Fallback / test double — survives in-app navigation and config change (held app-scoped), not process death. */
class InMemoryDraftStore(initial: String? = null) : DraftStore {
    private var value: String? = initial
    override fun read(): String? = value
    override fun write(value: String) { this.value = value }
    override fun clear() { value = null }
}

/**
 * The production binding over `multiplatform-settings` (NSUserDefaults on iOS, SharedPreferences on
 * Android) — so the draft survives process death (FR-012). Device-local only; no PII leaves the device.
 */
class SettingsDraftStore(
    private val settings: Settings,
    private val key: String = "catalog.create.draft.v1",
) : DraftStore {
    override fun read(): String? = settings.getStringOrNull(key)
    override fun write(value: String) { settings.putString(key, value) }
    override fun clear() { settings.remove(key) }
}
