package com.effyshopping.driver.mobile.features.history.domain

/** Read-only history. Both record types, grouped by day. */

data class HistoryRunRow(val runId: String, val type: String, val completedAt: String?, val stopCount: Int, val packageCount: Int = 0, val window: String? = null)
/**
 * One finished drop. [proofMethod] / [failureReason] are the wire's words (`photo`, `nobody_home`);
 * a drop with a [failureReason] came back to the hub.
 */
data class HistoryDropRow(
    val dropId: String,
    val orderRef: String,
    val customerSuburb: String,
    val completedAt: String,
    val proofCaptured: Boolean,
    val street: String? = null,
    val proofMethod: String? = null,
    val failureReason: String? = null,
)
data class HistoryDay(val date: String, val runs: List<HistoryRunRow>, val drops: List<HistoryDropRow>)
data class History(val days: List<HistoryDay>)

data class TimelineEntry(val status: String, val at: String)
data class ProofRecord(val method: String, val mediaUrl: String?, val note: String?, val capturedAt: String)
/** One stop of a finished run. [kind] is `shop` | `drop` | `hub`; [proofMethod] as the wire says it. */
data class HistoryStopRow(
    val stopId: String,
    val sequence: Int,
    val kind: String,
    val title: String,
    val done: Boolean,
    val completedAt: String?,
    val proofMethod: String?,
    val failureReason: String? = null,
)

data class HistoryDetail(
    val timeline: List<TimelineEntry>,
    val proof: ProofRecord?,
    val addressFull: String?,
    /** A run's stops in order; empty for a drop. */
    val stops: List<HistoryStopRow> = emptyList(),
    /** Rev 2 - a run's map; a drop's order, package count and (when it came back) why. */
    val map: com.effyshopping.driver.mobile.core.map.RunMap? = null,
    val orderRef: String? = null,
    val packageCount: Int = 0,
    val failureReason: String? = null,
    /** Rev 2 - the window in words: a run's span, or the one a drop was sold. */
    val window: String? = null,
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
