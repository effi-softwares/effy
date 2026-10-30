package com.effyshopping.driver.mobile.features.today.domain

import com.effyshopping.driver.mobile.features.delivery.domain.ParcelsToReturn
import com.effyshopping.driver.mobile.core.opening.Opening

/** The driver's current phase. */
enum class Phase { COLLECTION, DELIVERY, IDLE }

/** A queued/active work item shown on the home. Kind distinguishes a shop stop from a customer drop. */
data class TodayItem(
    val kind: Kind,
    val id: String,
    val runId: String,
    val title: String,
    val subtitle: String?,
    val status: String,
    /** Rev 2 - the card's details: a drop's street, the place in one line, counts, window, handover. */
    val street: String? = null,
    val place: String? = null,
    val packageCount: Int = 0,
    val coldCount: Int = 0,
    val window: com.effyshopping.driver.mobile.features.delivery.domain.DeliveryWindow? = null,
    val handover: com.effyshopping.driver.mobile.features.delivery.domain.Handover? = null,
) {
    /** The hub check-in that ends a collection round: a stop with no shop and no zone. */
    enum class Kind { COLLECTION_STOP, DELIVERY_DROP, HUB_CHECKIN }
}

/**
 * The phase-aware home snapshot. `remainingCount` is a count - the driver never sees currency
 * .
 */
data class Today(
    val phase: Phase,
    val activeRunId: String?,
    val active: TodayItem?,
    val upNext: List<TodayItem>,
    val remainingCount: Int,
    /**
     * When the current round opens; null means it IS open. Work is assigned the moment a
     * driver can take it, so the round on this screen may be hours from workable: it is shown in
     * full, and its actions wait for this.
     */
    val opening: Opening? = null,
    /** When the current round must be finished, in the server's words ("2 pm"). */
    val dueLabel: String? = null,
    /**
     * The other rounds the driver holds, soonest first. Until 072 a driver was told about one
     * round at a time, because a round only existed for the last 45 minutes before it was due.
     */
    val upcoming: List<UpcomingRound> = emptyList(),
    /** The last copy kept on the phone, shown with no signal (backlog C3) - not a fresh read. */
    val stale: Boolean = false,
    /**
     * The current round's parcels still to return to the hub. When they are all that is left,
     * [active] is null and Today shows the "Return to hub" step.
     */
    val toReturn: ParcelsToReturn? = null,
    /** What dispatch changed on the current round, in their words; null when nothing has. */
    val changedNote: String? = null,
    /** Rev 2 - progress through the current round, and its map. */
    val progress: TodayProgress? = null,
    val map: com.effyshopping.driver.mobile.core.map.RunMap? = null,
    /**
     * The current run is a delivery run not yet loaded: loading the van is the one next step.
     * [active] is null while it is set; the drops follow it in [upNext].
     */
    val loadStep: LoadStep? = null,
)

/** "Load the van": the run, and how much goes in it. */
data class LoadStep(val runId: String, val packageCount: Int, val dropCount: Int)

/** Rev 2 - shops collected or drops finished, of all; and the packages in and still to load. */
data class TodayProgress(
    val done: Int,
    val total: Int,
    val delivered: Int = 0,
    val notDelivered: Int = 0,
    val packagesInVan: Int = 0,
    val packagesToLoad: Int = 0,
)

/** A round the driver holds besides the current one. Opens its own run screen when tapped. */
data class UpcomingRound(
    val runId: String,
    val phase: Phase,
    /** Null = open now. */
    val opening: Opening?,
    val dueLabel: String,
    /** Shops or drops - the hub is not a place a driver would count. */
    val stopCount: Int,
    val packageCount: Int,
)

