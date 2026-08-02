package com.effyshopping.customer.mobile.features.saved.data

import com.effyshopping.customer.mobile.core.storage.DevicePreferences
import com.effyshopping.customer.mobile.core.storage.PreferenceKeys
import com.effyshopping.customer.mobile.features.saved.domain.SavedGuestEntry
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * The guest saved list on disk (033 FR-025).
 *
 * ⚠ WHY THIS EXISTS AT ALL. A guest can save without signing in, because the sign-in wall is the
 * single biggest documented reason saved-item features go unused. But a list that evaporates on the
 * next launch is WORSE than the wall — the shopper believes they kept something and did not. So the
 * guest list has to survive a force-quit, and this is what makes it.
 *
 * place, and `AppContainer` called the no-arg constructor — so the callback was `{}` and nothing was
 * ever written, for an entire feature, invisibly. Three separate comments in the repo then explained
 * the absence as "this app has no key-value persistence", which had been false since 026. If you are
 * changing this file, check `AppContainer` actually wires it.
 *
 * Built structurally on `CartLocalStore` (027): a versioned envelope, defensive decode, discard on
 * mismatch, and writes that can never crash the app.
 */
class SavedLocalStore(private val prefs: DevicePreferences) {

    /**
     * Load the guest list.
     *
     * ⚠ Any unparseable, truncated or older blob yields an EMPTY list — never a crash, and never a
     * half-parse. Losing a guest list is recoverable; a render crash is not, and a half-read list is
     * worst of all because the shopper would trust it.
     */
    fun load(): List<SavedGuestEntry> {
        val raw = prefs.getString(PreferenceKeys.SAVED_GUEST)
        if (raw.isNullOrBlank()) return emptyList()
        return runCatching {
            val env = json.decodeFromString<SavedGuestEnvelope>(raw)
            // ⚠ A version mismatch DISCARDS rather than migrates. Two shapes of the same list is how
            // they start disagreeing.
            if (env.version != SCHEMA_VERSION) emptyList() else env.items
        }.getOrDefault(emptyList())
    }

    /** Persist the guest list. ⚠ A failed write never crashes — this store is best-effort. */
    fun save(items: List<SavedGuestEntry>) {
        runCatching {
            prefs.putString(
                PreferenceKeys.SAVED_GUEST,
                json.encodeToString(SavedGuestEnvelope.serializer(), SavedGuestEnvelope(SCHEMA_VERSION, items)),
            )
        }
    }

    /** Sign-out, or a completed merge: nothing of this list may remain readable on the device. */
    fun clear() {
        runCatching { prefs.putString(PreferenceKeys.SAVED_GUEST, "") }
    }

    private companion object {
        /** ⚠ A mismatch DISCARDS. Bumping this deliberately throws the old list away. */
        const val SCHEMA_VERSION = 1

        val json = Json {
            // Catches a field a NEWER build wrote, so a downgrade degrades rather than crashes.
            ignoreUnknownKeys = true
            encodeDefaults = true
        }
    }
}

@Serializable
private data class SavedGuestEnvelope(
    val version: Int,
    val items: List<SavedGuestEntry>,
)
