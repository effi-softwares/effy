package com.effyshopping.driver.mobile.features.history.domain

/** Read-only history (049 US5). Both record types, grouped by day. */

data class HistoryRunRow(val runId: String, val type: String, val completedAt: String?, val stopCount: Int)
data class HistoryDropRow(val dropId: String, val orderRef: String, val customerSuburb: String, val completedAt: String, val proofCaptured: Boolean)
data class HistoryDay(val date: String, val runs: List<HistoryRunRow>, val drops: List<HistoryDropRow>)
data class History(val days: List<HistoryDay>)

data class TimelineEntry(val status: String, val at: String)
data class ProofRecord(val method: String, val mediaUrl: String?, val note: String?, val capturedAt: String)
/** 092 — one stop of a finished run. [kind] is `shop` | `drop` | `hub`; [proofMethod] as the wire says it. */
data class HistoryStopRow(
    val stopId: String,
    val sequence: Int,
    val kind: String,
    val title: String,
    val done: Boolean,
    val completedAt: String?,
    val proofMethod: String?,
)

data class HistoryDetail(
    val timeline: List<TimelineEntry>,
    val proof: ProofRecord?,
    val addressFull: String?,
    /** 092 — a run's stops in order; empty for a drop. */
    val stops: List<HistoryStopRow> = emptyList(),
)

interface HistoryRepository {
    suspend fun list(): History
    suspend fun detail(kind: String, id: String): HistoryDetail
}

class GetHistory(private val repo: HistoryRepository) {
    suspend operator fun invoke() = repo.list()
}
class GetHistoryDetail(private val repo: HistoryRepository) {
    suspend operator fun invoke(kind: String, id: String) = repo.detail(kind, id)
}
