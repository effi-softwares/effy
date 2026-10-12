package com.effyshopping.driver.mobile.features.collection.data

import com.effyshopping.driver.mobile.features.collection.domain.ReportedProblem
import com.effyshopping.driver.mobile.features.collection.domain.StopDraft
import com.effyshopping.driver.mobile.features.collection.domain.StopDrafts
import com.russhwolf.settings.Settings
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** [StopDrafts] in the phone's preferences — small, one stop, and gone once the stop is collected. */
class SettingsStopDrafts(
    private val settings: Settings,
    private val json: Json = Json { ignoreUnknownKeys = true },
) : StopDrafts {

    @Serializable
    private data class Stored(
        val runId: String,
        val stopId: String,
        val confirmed: List<String> = emptyList(),
        val reported: Map<String, Problem> = emptyMap(),
    )

    @Serializable
    private data class Problem(val kind: String, val note: String? = null)

    override fun load(runId: String, stopId: String): StopDraft? {
        val raw = settings.getStringOrNull(KEY) ?: return null
        val stored = runCatching { json.decodeFromString(Stored.serializer(), raw) }.getOrNull() ?: return null
        if (stored.runId != runId || stored.stopId != stopId) return null
        return StopDraft(
            stopId = stored.stopId,
            confirmed = stored.confirmed.toSet(),
            reported = stored.reported.mapValues { ReportedProblem(it.value.kind, it.value.note) },
        )
    }

    override fun save(runId: String, draft: StopDraft) {
        if (draft.confirmed.isEmpty() && draft.reported.isEmpty()) return clear()
        val stored = Stored(
            runId = runId,
            stopId = draft.stopId,
            confirmed = draft.confirmed.toList(),
            reported = draft.reported.mapValues { Problem(it.value.kind, it.value.note) },
        )
        settings.putString(KEY, json.encodeToString(Stored.serializer(), stored))
    }

    override fun clear() = settings.remove(KEY)

    private companion object {
        const val KEY = "driver.stop.draft.v1"
    }
}
