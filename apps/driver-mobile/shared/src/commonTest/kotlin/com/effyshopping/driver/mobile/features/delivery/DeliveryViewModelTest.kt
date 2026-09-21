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

private class FakeDeliveryRepo(var drop: Drop? = null, var fail: AppError? = null) : DeliveryRepository {
    var mediaMethod: ProofMethod? = null
    var mediaBytes: ByteArray? = null
    var mediaNote: String? = null
    override suspend fun getRun(runId: String): DeliveryRun = DeliveryRun(runId, "active", emptyList())
    override suspend fun getDrop(dropId: String): Drop = fail?.let { throw AppException(it) } ?: drop!!
    override suspend fun advance(dropId: String, to: String, changeId: String): DropStatus = DropStatus.ARRIVED
    override suspend fun completeWithMedia(dropId: String, method: ProofMethod, bytes: ByteArray, note: String?, changeId: String) {
        fail?.let { throw AppException(it) }
        mediaMethod = method; mediaBytes = bytes; mediaNote = note
    }
    override suspend fun fail(dropId: String, reason: FailureReason, note: String?, changeId: String) { fail?.let { throw AppException(it) } }
}

class DeliveryViewModelTest {
    @BeforeTest fun setup() { Dispatchers.setMain(Dispatchers.Unconfined) }

    private fun vm(repo: FakeDeliveryRepo) = DeliveryViewModel(
        runId = "r1",
        getRun = GetDeliveryRun(repo), getDrop = GetDrop(repo), advanceDrop = AdvanceDrop(repo),
        completeWithMedia = CompleteWithMedia(repo), failDrop = FailDrop(repo), newChangeId = { "cid" },
    )

    private fun drop() = Drop("d1", "EFY-1", "Ada", "1 St", null, emptyList(), DropStatus.ARRIVED)

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

    @Test fun fail_marks_the_failed_state() = runTest {
        val repo = FakeDeliveryRepo(drop = drop()); val v = vm(repo)
        v.fail("d1", FailureReason.NOBODY_HOME, null)
        assertTrue(v.state.value.failed)
    }
}
