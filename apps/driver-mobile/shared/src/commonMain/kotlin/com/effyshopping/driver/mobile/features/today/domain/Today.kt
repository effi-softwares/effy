package com.effyshopping.driver.mobile.features.today.domain

/** The driver's current phase (049 FR-021). */
enum class Phase { COLLECTION, SAME_DAY_DELIVERY, IDLE }

/** A queued/active work item shown on the home. Kind distinguishes a shop stop from a customer drop. */
data class TodayItem(
    val kind: Kind,
    val id: String,
    val runId: String,
    val title: String,
    val subtitle: String?,
    val status: String,
) {
    /**
     * ⚠ `HUB_CHECKIN` ADDED BY 064. A collection round ends at the hub, and until this existed the
     * home screen had nothing to show once the last shop stop was done — the round became
     * unreachable with the load still in the van. It is a stop like any other here; what makes it
     * different is that it has no shop and no zone.
     */
    enum class Kind { COLLECTION_STOP, DELIVERY_DROP, HUB_CHECKIN }
}

/**
 * The phase-aware home snapshot (049). `remainingCount` is a COUNT — the driver never sees currency
 * (FR-013).
 */
data class Today(
    val phase: Phase,
    val activeRunId: String?,
    val active: TodayItem?,
    val upNext: List<TodayItem>,
    val remainingCount: Int,
)
