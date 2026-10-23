package com.effyshopping.driver.mobile.core.live

import com.effyshopping.driver.mobile.core.offline.WriteOutcome
import com.effyshopping.driver.mobile.core.scan.HandedOver
import com.effyshopping.driver.mobile.features.collection.domain.CollectionRepository
import com.effyshopping.driver.mobile.features.collection.domain.HubSplit
import com.effyshopping.driver.mobile.features.collection.domain.PackageOutcome
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryRepository
import com.effyshopping.driver.mobile.features.delivery.domain.FailureReason
import com.effyshopping.driver.mobile.features.delivery.domain.ProofMethod
import com.effyshopping.driver.mobile.features.driver.domain.Driver
import com.effyshopping.driver.mobile.features.driver.domain.DriverRepository
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.merge

/**
 * Rev 2 — "THE DRIVER'S WORK CHANGED: READ NOW", from one place.
 *
 * Every screen that shows work (Today, a run, a stop, a drop, History) re-reads when this speaks. It
 * speaks for two reasons:
 *  • **the server said so** — the live channel: dispatch assigned, moved, re-ordered or withdrew
 *  work, or the channel (re)connected;
 *  • **the driver did something** — a write of theirs reached the platform. The server never announces
 *  a driver's own change back to them (it tells the shops, the customer and dispatch), so until this
 *  existed Today kept saying "Next · stop 1" after stop 1 was collected.
 *
 * It speaks only once the platform has the change: a write that was sent, or a queued one the sync
 * coordinator has just delivered ([changed] is called from there too). A write saved with no signal is
 * not announced — re-reading then would fetch the copy without it.
 *
 * Screens also re-read when they are shown again (`shown` / `showRun`) — kept as the fallback.
 */
class WorkChanges(private val server: Flow<Unit>) {
    private val own = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    /** A write of the driver's reached the platform. Never suspends; a burst is one re-read. */
    fun changed() {
        own.tryEmit(Unit)
    }

    /** The one stream every work-showing ViewModel collects. */
    val changes: Flow<Unit> get() = merge(server, own)
}

private fun WriteOutcome.reached() = this == WriteOutcome.SENT

/**
 * The collection writes, saying so when they land. The one place a collection write announces itself
 * a ViewModel never calls [WorkChanges.changed] (a screen that forgets is how this bug happened).
 */
class SignallingCollectionRepository(
    private val inner: CollectionRepository,
    private val work: WorkChanges,
) : CollectionRepository by inner {
    override suspend fun collect(
        runId: String,
        stopId: String,
        changeId: String,
        outcomes: List<PackageOutcome>,
        handed: List<HandedOver>,
        missing: List<com.effyshopping.driver.mobile.core.scan.MissingBag>,
    ): com.effyshopping.driver.mobile.features.collection.domain.Collected =
        inner.collect(runId, stopId, changeId, outcomes, handed, missing).also { if (it.outcome.reached()) work.changed() }

    // A check-in answers with where the parcels go once the platform has it; null is saved to send.
    override suspend fun checkIn(runId: String, changeId: String, handed: List<HandedOver>, missing: List<com.effyshopping.driver.mobile.core.scan.MissingBag>): HubSplit? =
        inner.checkIn(runId, changeId, handed, missing).also { if (it != null) work.changed() }
}

/** The delivery writes, saying so when they land. */
class SignallingDeliveryRepository(
    private val inner: DeliveryRepository,
    private val work: WorkChanges,
) : DeliveryRepository by inner {
    override suspend fun advance(dropId: String, to: String, changeId: String): WriteOutcome =
        inner.advance(dropId, to, changeId).also { if (it.reached()) work.changed() }

    override suspend fun completeWithMedia(
        dropId: String, method: ProofMethod, bytes: ByteArray, note: String?, changeId: String, handed: List<HandedOver>,
    ): WriteOutcome = inner.completeWithMedia(dropId, method, bytes, note, changeId, handed).also { if (it.reached()) work.changed() }

    override suspend fun fail(dropId: String, reason: FailureReason, note: String?, changeId: String): WriteOutcome =
        inner.fail(dropId, reason, note, changeId).also { if (it.reached()) work.changed() }

    override suspend fun returnToHub(runId: String, changeId: String, handed: List<HandedOver>): WriteOutcome =
        inner.returnToHub(runId, changeId, handed).also { if (it.reached()) work.changed() }

    override suspend fun load(
        runId: String, changeId: String, handed: List<HandedOver>, notLoaded: List<com.effyshopping.driver.mobile.features.delivery.domain.NotLoaded>,
    ): WriteOutcome = inner.load(runId, changeId, handed, notLoaded).also { if (it.reached()) work.changed() }
}

/** Going on or off duty changes what Today shows. */
class SignallingDriverRepository(
    private val inner: DriverRepository,
    private val work: WorkChanges,
) : DriverRepository by inner {
    override suspend fun setDuty(onDuty: Boolean, changeId: String): Driver =
        inner.setDuty(onDuty, changeId).also { work.changed() }

    // A check answered changes whether work can come.
    override suspend fun submitVehicleCheck(
        changeId: String, answers: List<com.effyshopping.driver.mobile.features.driver.domain.VehicleCheckAnswer>,
    ): com.effyshopping.driver.mobile.features.driver.domain.VehicleCheckStatus =
        inner.submitVehicleCheck(changeId, answers).also { work.changed() }
}
