package com.effyshopping.driver.mobile.features.delivery

import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.features.delivery.domain.AdvanceDrop
import com.effyshopping.driver.mobile.features.delivery.domain.CompleteContactless
import com.effyshopping.driver.mobile.features.delivery.domain.CompleteWithCode
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
import kotlin.test.assertTrue

private class FakeDeliveryRepo(var drop: Drop? = null, var fail: AppError? = null) : DeliveryRepository {
    var codeUsed: String? = null
    var mediaMethod: ProofMethod? = null
    override suspend fun getRun(runId: String): DeliveryRun = DeliveryRun(runId, "active", emptyList())
    override suspend fun getDrop(dropId: String): Drop = fail?.let { throw AppException(it) } ?: drop!!
    override suspend fun advance(dropId: String, to: String, changeId: String): DropStatus = DropStatus.ARRIVED
    override suspend fun completeWithCode(dropId: String, code: String, note: String?, changeId: String) {
        fail?.let { throw AppException(it) }; codeUsed = code
    }
    override suspend fun completeContactless(dropId: String, note: String?, changeId: String) { fail?.let { throw AppException(it) } }
    override suspend fun completeWithMedia(dropId: String, method: ProofMethod, bytes: ByteArray, note: String?, changeId: String) {
        fail?.let { throw AppException(it) }; mediaMethod = method
    }
    override suspend fun fail(dropId: String, reason: FailureReason, note: String?, changeId: String) { fail?.let { throw AppException(it) } }
}

class DeliveryViewModelTest {
    @BeforeTest fun setup() { Dispatchers.setMain(Dispatchers.Unconfined) }

    private fun vm(repo: FakeDeliveryRepo) = DeliveryViewModel(
        runId = "r1",
        getRun = GetDeliveryRun(repo), getDrop = GetDrop(repo), advanceDrop = AdvanceDrop(repo),
        completeWithCode = CompleteWithCode(repo), completeContactless = CompleteContactless(repo),
        completeWithMedia = CompleteWithMedia(repo), failDrop = FailDrop(repo), newChangeId = { "cid" },
    )

    private fun drop() = Drop("d1", "EFY-1", "Ada", "1 St", null, emptyList(), DropStatus.ARRIVED)

    @Test fun code_proof_marks_delivered() = runTest {
        val repo = FakeDeliveryRepo(drop = drop()); val v = vm(repo)
        v.deliverWithCode("d1", "1234", null)
        assertEquals("1234", repo.codeUsed)
        assertTrue(v.state.value.delivered)
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

    @Test fun a_failed_proof_does_not_mark_delivered_and_shows_a_message() = runTest {
        val repo = FakeDeliveryRepo(drop = drop(), fail = AppError.Network); val v = vm(repo)
        v.deliverWithCode("d1", "1234", null)
        assertTrue(!v.state.value.delivered)
        assertNotNull(v.state.value.message)
    }

    @Test fun fail_marks_the_failed_state() = runTest {
        val repo = FakeDeliveryRepo(drop = drop()); val v = vm(repo)
        v.fail("d1", FailureReason.NOBODY_HOME, null)
        assertTrue(v.state.value.failed)
    }
}
