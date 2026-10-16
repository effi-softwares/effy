package com.effyshopping.driver.mobile.features.today.domain

import com.effyshopping.driver.mobile.features.delivery.domain.ParcelsToReturn
import com.effyshopping.driver.mobile.core.opening.Opening

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
    /**
     * 072 — when the current round opens; null means it IS open. Work is assigned the moment a
     * driver can take it, so the round on this screen may be hours from workable: it is shown in
     * full, and its actions wait for this.
     */
    val opening: Opening? = null,
    /** 072 — when the current round must be finished, in the server's words ("2 pm"). */
    val dueLabel: String? = null,
    /**
     * 072 — the other rounds the driver holds, soonest first. Until 072 a driver was told about one
     * round at a time, because a round only existed for the last 45 minutes before it was due.
     */
    val upcoming: List<UpcomingRound> = emptyList(),
    /** The last copy kept on the phone, shown with no signal (backlog C3) — not a fresh read. */
    val stale: Boolean = false,
    /**
     * 088 — the current round's parcels still to return to the hub. When they are all that is left,
     * [active] is null and Today shows the "Return to hub" step.
     */
    val toReturn: ParcelsToReturn? = null,
)

/** A round the driver holds besides the current one (072). Opens its own run screen when tapped. */
data class UpcomingRound(
    val runId: String,
    val phase: Phase,
    /** Null = open now. */
    val opening: Opening?,
    val dueLabel: String,
    /** Shops or drops — the hub is not a place a driver would count. */
    val stopCount: Int,
    val packageCount: Int,
)

/** What this driver has finished today, counted from their own history. Counts, never money. */
data class DayStats(val runsFinished: Int, val deliveries: Int)

/**
 * How long the driver's shifts run, timed ON THE PHONE from the duty toggle.
 *
 * ⚠ The driver's own record does not say when they went on duty, so a shift that began on another
 * phone — or before this was built — has no length here, and none is shown for it.
 */
interface ShiftClock {
    fun started(atEpochMillis: Long)
    fun ended(atEpochMillis: Long)
    /** The length of the shift that last ended on this phone; null when it is not known. */
    fun lastShiftMillis(): Long?
}
