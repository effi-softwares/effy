package com.effyshopping.driver.mobile.features.delivery

import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.features.delivery.domain.AdvanceDrop
import com.effyshopping.driver.mobile.features.delivery.domain.CompleteWithMedia
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryRepository
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryRun
import com.effyshopping.driver.mobile.features.delivery.domain.Drop
import com.effyshopping.driver.mobile.features.delivery.domain.DropStatus
import com.effyshopping.driver.mobile.features.delivery.domain.FailDrop
import com.effyshopping.driver.mobile.features.delivery.domain.FailureReason
import com.effyshopping.driver.mobile.features.delivery.domain.GetDeliveryRun
import com.effyshopping.driver.mobile.features.delivery.domain.GetDrop
import com.effyshopping.driver.mobile.features.delivery.domain.ProofMethod
import com.effyshopping.driver.mobile.features.delivery.presentation.DeliveryViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import com.effyshopping.driver.mobile.core.offline.WriteOutcome
import com.effyshopping.driver.mobile.features.delivery.domain.ParcelsToReturn
import com.effyshopping.driver.mobile.features.delivery.domain.ReturnToHub
import com.effyshopping.driver.mobile.features.delivery.domain.LoadVan
import com.effyshopping.driver.mobile.features.delivery.domain.DropSummary

private class FakeDeliveryRepo(var drop: Drop? = null, var fail: AppError? = null) : DeliveryRepository {
    var mediaMethod: ProofMethod? = null
    var mediaBytes: ByteArray? = null
    var mediaNote: String? = null
    var run: DeliveryRun? = null
    override suspend fun getRun(runId: String): DeliveryRun = run ?: DeliveryRun(runId, "active", emptyList())
    val returned = mutableListOf<String>()
    override suspend fun returnToHub(runId: String, changeId: String, handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver>): WriteOutcome {
        fail?.let { throw AppException(it) }
        returned += changeId
        if (!offline) run = run?.copy(toReturn = null)
        return outcome
    }
    override suspend fun getDrop(dropId: String): Drop = fail?.let { throw AppException(it) } ?: drop!!
    var offline = false
    private val outcome get() = if (offline) WriteOutcome.QUEUED else WriteOutcome.SENT
    /** Every write, in the order it was made — "advance:arrived", "proof", "load". */
    val calls = mutableListOf<String>()
    override suspend fun advance(dropId: String, to: String, changeId: String): WriteOutcome {
        calls += "advance:$to"
        return outcome
    }
    var lastNotLoaded: List<com.effyshopping.driver.mobile.features.delivery.domain.NotLoaded> = emptyList()
    override suspend fun load(runId: String, changeId: String, handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver>, notLoaded: List<com.effyshopping.driver.mobile.features.delivery.domain.NotLoaded>): WriteOutcome {
        lastHanded = handed
        lastNotLoaded = notLoaded
        fail?.let { throw AppException(it) }
        calls += "load"
        return outcome
    }
    var lastHanded: List<com.effyshopping.driver.mobile.core.scan.HandedOver> = emptyList()
    override suspend fun completeWithMedia(dropId: String, method: ProofMethod, bytes: ByteArray, note: String?, changeId: String, handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver>): WriteOutcome {
        lastHanded = handed
        fail?.let { throw AppException(it) }
        calls += "proof"
        mediaMethod = method; mediaBytes = bytes; mediaNote = note
        return outcome
    }
    override suspend fun fail(dropId: String, reason: FailureReason, note: String?, changeId: String): WriteOutcome {
        fail?.let { throw AppException(it) }
        return outcome
    }
}

class DeliveryViewModelTest {
    @BeforeTest fun setup() { Dispatchers.setMain(Dispatchers.Unconfined) }

    private fun vm(repo: FakeDeliveryRepo, live: kotlinx.coroutines.flow.Flow<Unit> = kotlinx.coroutines.flow.emptyFlow()): DeliveryViewModel {
        var n = 0
        return DeliveryViewModel(
            runId = "r1",
            getRun = GetDeliveryRun(repo), getDrop = GetDrop(repo), advanceDrop = AdvanceDrop(repo),
            completeWithMedia = CompleteWithMedia(repo), failDrop = FailDrop(repo), newChangeId = { "cid-${n++}" },
            returnToHub = ReturnToHub(repo),
            loadVan = LoadVan(repo),
            now = { 1_000L },
            liveChanges = live,
        )
    }

    /**
     * 092 rev 2 — "work changed" while the driver is at the door: the drop is re-read (new instructions,
     * a cancelled order). Not once they have finished it: Delivered describes what they did.
     */
    @Test fun work_changed_re_reads_the_open_drop_until_it_is_finished() = runTest {
        val live = kotlinx.coroutines.flow.MutableSharedFlow<Unit>()
        val repo = FakeDeliveryRepo(drop = drop())
        val v = vm(repo, live).apply { loadRun(); loadDrop("d1") }
        repo.drop = drop().copy(instructions = "Side gate")
        live.emit(Unit)
        assertEquals("Side gate", v.state.value.drop?.instructions)
        v.fail("d1", com.effyshopping.driver.mobile.features.delivery.domain.FailureReason.NOBODY_HOME, null)
        repo.drop = drop().copy(instructions = "Changed after")
        live.emit(Unit)
        assertEquals("Side gate", v.state.value.drop?.instructions)
    }

    private val toReturn = ParcelsToReturn("r1", 2, listOf("EFY-1", "EFY-2"))

    private fun drop() = Drop("d1", "EFY-1", "Ada", "1 St", null, emptyList(), DropStatus.ARRIVED)

    /**
     * ⚠ 092 R5 — TWO TAPS, AND THE ARRIVAL IS STILL RECORDED. The driver no longer says "I've arrived";
     * the ViewModel records it, silently and FIRST, so the platform's timeline keeps an arrival before
     * the proof — sent in that order, or saved in that order with no signal.
     */
    @Test fun delivering_an_out_drop_records_arrival_first_then_the_proof() = runTest {
        val repo = FakeDeliveryRepo(drop = drop().copy(status = DropStatus.OUT_FOR_DELIVERY)); val v = vm(repo)
        v.loadDrop("d1")
        v.deliver("d1", ProofMethod.PHOTO, byteArrayOf(1), null)
        assertEquals(listOf("advance:arrived", "proof"), repo.calls)
        assertTrue(v.state.value.delivered)
        assertEquals(ProofMethod.PHOTO, v.state.value.deliveredWith)
        assertEquals(1_000L, v.state.value.deliveredAtEpochMillis)
    }

    @Test fun the_same_order_holds_with_no_signal() = runTest {
        val repo = FakeDeliveryRepo(drop = drop().copy(status = DropStatus.OUT_FOR_DELIVERY)).apply { offline = true }; val v = vm(repo)
        v.loadDrop("d1")
        v.deliver("d1", ProofMethod.CONTACTLESS, byteArrayOf(1), "Left at: Front door")
        assertEquals(listOf("advance:arrived", "proof"), repo.calls)
        assertTrue(v.state.value.proofSending)
    }

    /** 092 T026 — the door scan's methods ride the proof. */
    @Test fun the_door_scan_rides_the_proof() = runTest {
        val repo = FakeDeliveryRepo(drop = drop()); val v = vm(repo)
        v.loadDrop("d1")
        val handed = listOf(com.effyshopping.driver.mobile.core.scan.HandedOver("AAAAAA", com.effyshopping.driver.mobile.core.scan.HandMethod.SCAN))
        v.deliver("d1", ProofMethod.PHOTO, byteArrayOf(1), null, handed)
        assertEquals(handed, repo.lastHanded)
    }

    @Test fun an_arrived_drop_is_not_moved_again() = runTest {
        val repo = FakeDeliveryRepo(drop = drop()); val v = vm(repo)
        v.loadDrop("d1")
        v.deliver("d1", ProofMethod.SIGNATURE, byteArrayOf(1), "Signed by: Ada")
        assertEquals(listOf("proof"), repo.calls)
    }

    /** 093 — a drop not yet loaded: delivering, failing or moving it is refused at once, and nothing is sent. */
    @Test fun nothing_on_a_drop_before_the_van_is_loaded() = runTest {
        val repo = FakeDeliveryRepo(drop = drop().copy(status = DropStatus.STAGED)); val v = vm(repo)
        v.loadDrop("d1")
        v.deliver("d1", ProofMethod.PHOTO, byteArrayOf(1), null)
        v.fail("d1", com.effyshopping.driver.mobile.features.delivery.domain.FailureReason.NOBODY_HOME, null)
        v.advance("d1", "arrived")
        assertEquals(emptyList(), repo.calls)
        assertEquals("Load the van first.", v.state.value.message)
        assertTrue(!v.state.value.delivered && !v.state.value.failed)
    }

    /** 093 — a package declared not loaded rides the load; a drop with nothing loaded leaves the run. */
    @Test fun loading_with_a_package_declared_missing() = runTest {
        val lone = DropSummary("d1", 1, "EFY-1", "Carlton", 1, DropStatus.STAGED, packageCodes = listOf("AAAAAA"))
        val pair = DropSummary("d2", 2, "EFY-2", "Fitzroy", 2, DropStatus.STAGED, packageCodes = listOf("BBBBBB", "CCCCCC"))
        val repo = FakeDeliveryRepo().apply { offline = true; run = DeliveryRun("r1", "planned", listOf(lone, pair)) }
        val v = vm(repo)
        v.loadRun()
        val missing = listOf(
            com.effyshopping.driver.mobile.features.delivery.domain.NotLoaded("AAAAAA", com.effyshopping.driver.mobile.features.delivery.domain.MissingReason.DAMAGED),
            com.effyshopping.driver.mobile.features.delivery.domain.NotLoaded("CCCCCC", com.effyshopping.driver.mobile.features.delivery.domain.MissingReason.NOT_AT_HUB),
        )
        v.loadVan(notLoaded = missing)
        assertEquals(missing, repo.lastNotLoaded)
        val drops = v.state.value.run!!.drops
        assertEquals(listOf("d2"), drops.map { it.dropId })
        assertEquals(listOf("BBBBBB"), drops.single().packageCodes)
        assertEquals(DropStatus.OUT_FOR_DELIVERY, drops.single().status)
        assertEquals("Van loaded · 2 packages left for dispatch", v.state.value.notice)
    }

    /** 090 / 092 — the van is loaded once: every staged drop goes out, a drop further on stays put. */
    @Test fun loading_the_van_sends_every_staged_drop_out() = runTest {
        val staged = DropSummary("d1", 1, "EFY-1", "Carlton", 1, DropStatus.STAGED)
        val arrived = DropSummary("d2", 2, "EFY-2", "Fitzroy", 1, DropStatus.ARRIVED)
        val repo = FakeDeliveryRepo().apply { offline = true; run = DeliveryRun("r1", "planned", listOf(staged, arrived)) }
        val v = vm(repo)
        v.loadRun()
        v.loadVan()
        assertEquals(listOf("load"), repo.calls)
        assertEquals(listOf(DropStatus.OUT_FOR_DELIVERY, DropStatus.ARRIVED), v.state.value.run?.drops?.map { it.status })
    }

    @Test fun signature_proof_uses_the_media_path() = runTest {
        val repo = FakeDeliveryRepo(drop = drop()); val v = vm(repo)
        v.deliverWithSignature("d1", byteArrayOf(1, 2, 3), null)
        assertEquals(ProofMethod.SIGNATURE, repo.mediaMethod)
        assertTrue(v.state.value.delivered)
    }

    @Test fun photo_proof_uses_the_media_path() = runTest {
        val repo = FakeDeliveryRepo(drop = drop()); val v = vm(repo)
        v.deliverWithPhoto("d1", byteArrayOf(9), null)
        assertEquals(ProofMethod.PHOTO, repo.mediaMethod)
    }

    /**
     * ⚠ 064, FR-002 — an unattended drop carries a PHOTOGRAPH, and it is recorded as CONTACTLESS.
     *
     * Both halves matter. Before 064 contactless completed with no image at all; and the repository
     * mapped every non-PHOTO method to SIGNATURE, so routing contactless through the media path would
     * have recorded each one as a customer signature — which the backend ACCEPTS, since signature
     * plus media is a valid proof. Every "left at the door" would have been filed as "they signed for
     * it", with nothing failing anywhere.
     */
    @Test fun contactless_carries_a_photo_and_is_recorded_as_contactless() = runTest {
        val repo = FakeDeliveryRepo(drop = drop()); val v = vm(repo)
        v.deliverContactless("d1", byteArrayOf(7, 7), "Left at: Front door")
        assertEquals(ProofMethod.CONTACTLESS, repo.mediaMethod)
        assertEquals(2, repo.mediaBytes?.size)
        assertEquals("Left at: Front door", repo.mediaNote)
        assertTrue(v.state.value.delivered)
    }

    /**
     * ⚠ FR-006 — a drop is NOT delivered when its proof did not save.
     *
     * The repository throws when the upload fails, and that has to reach the driver as a message
     * rather than as a quietly-successful delivery. This is the case a driver can act on: retake the
     * photo. A delivery marked complete against an image that never arrived cannot be recovered at
     * all, because nobody knows it is missing.
     */
    @Test fun a_failed_proof_does_not_mark_delivered_and_shows_a_message() = runTest {
        val repo = FakeDeliveryRepo(drop = drop(), fail = AppError.Network); val v = vm(repo)
        v.deliverWithPhoto("d1", byteArrayOf(1), null)
        assertTrue(!v.state.value.delivered)
        assertNotNull(v.state.value.message)
    }

    @Test fun a_failed_contactless_upload_does_not_mark_delivered() = runTest {
        val repo = FakeDeliveryRepo(drop = drop(), fail = AppError.Network); val v = vm(repo)
        v.deliverContactless("d1", byteArrayOf(1), null)
        assertTrue(!v.state.value.delivered)
        assertNull(repo.mediaMethod)
    }

    /** Backlog B3 — proof with no signal is saved: the drop is delivered, the proof is sending. */
    @Test fun proof_saved_offline_reads_delivered_and_sending() = runTest {
        val repo = FakeDeliveryRepo(drop = drop()).apply { offline = true }; val v = vm(repo)
        v.deliverWithPhoto("d1", byteArrayOf(1), null)
        assertTrue(v.state.value.delivered)
        assertTrue(v.state.value.proofSending)
        assertNull(v.state.value.message)
    }

    /** Backlog C1 — a step saved offline moves the drop on, rather than showing "You're offline". */
    @Test fun a_step_saved_offline_moves_the_drop_on() = runTest {
        val repo = FakeDeliveryRepo(drop = drop().copy(status = DropStatus.EN_ROUTE)); val v = vm(repo)
        v.loadDrop("d1")
        repo.offline = true
        v.advance("d1", "arrived")
        assertEquals(DropStatus.ARRIVED, v.state.value.drop?.status)
        assertNull(v.state.value.message)
    }

    /** 088 — one action returns the run's failed parcels; the step goes once it is sent. */
    @Test fun return_to_hub_clears_the_step() = runTest {
        val repo = FakeDeliveryRepo(drop = drop()).apply { run = DeliveryRun("r1", "active", emptyList(), toReturn = toReturn) }
        val v = vm(repo)
        v.loadRun()
        assertEquals(2, v.state.value.run?.toReturn?.count)
        v.returnParcels()
        assertNull(v.state.value.run?.toReturn)
        assertEquals(1, repo.returned.size)
    }

    /** 088 — with no signal the return is saved and the step goes at once; a retry is the same write. */
    @Test fun return_to_hub_offline_moves_on_and_keeps_one_change_id() = runTest {
        val repo = FakeDeliveryRepo(drop = drop(), fail = AppError.Unavailable)
            .apply { run = DeliveryRun("r1", "active", emptyList(), toReturn = toReturn) }
        val v = vm(repo)
        v.loadRun()
        v.returnParcels()                 // refused for now — not final
        assertNotNull(v.state.value.message)
        repo.fail = null; repo.offline = true
        v.returnParcels()                 // saved to send
        assertNull(v.state.value.run?.toReturn)
        assertEquals(listOf("cid-0"), repo.returned)
    }

    @Test fun fail_marks_the_failed_state() = runTest {
        val repo = FakeDeliveryRepo(drop = drop()); val v = vm(repo)
        v.fail("d1", FailureReason.NOBODY_HOME, null)
        assertTrue(v.state.value.failed)
    }
}
