package com.effyshopping.customer.mobile.features.feedback

import com.effyshopping.customer.mobile.features.feedback.domain.FeedbackCategory
import com.effyshopping.customer.mobile.features.feedback.domain.FeedbackDraft
import com.effyshopping.customer.mobile.features.feedback.domain.FeedbackRepository
import com.effyshopping.customer.mobile.features.feedback.domain.SubmitFeedback
import com.effyshopping.customer.mobile.features.feedback.domain.SubmitFeedbackResult
import com.effyshopping.customer.mobile.features.feedback.presentation.FeedbackViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Records what reached the port so a test can assert route selection + the payload. */
private class FakeFeedbackRepository(var result: SubmitFeedbackResult) : FeedbackRepository {
    var lastDraft: FeedbackDraft? = null
    var lastAuthenticated: Boolean? = null
    var calls = 0
    override suspend fun submit(draft: FeedbackDraft, authenticated: Boolean): SubmitFeedbackResult {
        calls++
        lastDraft = draft
        lastAuthenticated = authenticated
        return result
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class FeedbackViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @BeforeTest fun setUp() = Dispatchers.setMain(dispatcher)
    @AfterTest fun tearDown() = Dispatchers.resetMain()

    private fun vm(repo: FeedbackRepository, signedIn: Boolean): FeedbackViewModel =
        FeedbackViewModel(SubmitFeedback(repo), isSignedIn = { signedIn })

    @Test
    fun cannotSubmitUntilCategoryAndMessagePresent() {
        val repo = FakeFeedbackRepository(SubmitFeedbackResult.Ok("FB-X"))
        val model = vm(repo, signedIn = false)
        assertFalse(model.state.value.canSubmit)
        model.setMessage("hi")
        assertFalse(model.state.value.canSubmit)
        model.setCategory(FeedbackCategory.BUG)
        assertTrue(model.state.value.canSubmit)
    }

    @Test
    fun guestSubmitsToPublicRouteWithEmailAndShowsReference() = runTest(dispatcher) {
        val repo = FakeFeedbackRepository(SubmitFeedbackResult.Ok("FB-GUEST"))
        val model = vm(repo, signedIn = false)
        model.setCategory(FeedbackCategory.SUGGESTION)
        model.setMessage("add dark mode")
        model.setEmail("guest@example.com")
        model.submit()
        advanceUntilIdle()

        assertEquals(false, repo.lastAuthenticated)
        assertEquals("guest@example.com", repo.lastDraft?.email)
        assertEquals(SubmitFeedbackResult.Ok("FB-GUEST"), model.state.value.result)
        assertFalse(model.state.value.submitting)
    }

    @Test
    fun signedInSubmitsToAuthedRouteAndDropsBodyEmail() = runTest(dispatcher) {
        val repo = FakeFeedbackRepository(SubmitFeedbackResult.Ok("FB-AUTH"))
        val model = vm(repo, signedIn = true)
        model.setCategory(FeedbackCategory.COMPLAINT)
        model.setMessage("checkout is slow")
        model.setEmail("ignored@example.com")
        model.submit()
        advanceUntilIdle()

        assertEquals(true, repo.lastAuthenticated)
        assertNull(repo.lastDraft?.email)
    }

    @Test
    fun failureLeavesFieldsIntactSoWordsSurvive() = runTest(dispatcher) {
        val repo = FakeFeedbackRepository(SubmitFeedbackResult.Error)
        val model = vm(repo, signedIn = false)
        model.setCategory(FeedbackCategory.OTHER)
        model.setMessage("something to keep")
        model.submit()
        advanceUntilIdle()

        assertEquals(SubmitFeedbackResult.Error, model.state.value.result)
        assertEquals("something to keep", model.state.value.message)
        assertEquals(FeedbackCategory.OTHER, model.state.value.category)
    }

    @Test
    fun blankMessageIsRejectedByTheUseCaseWithoutHittingTheRepo() = runTest(dispatcher) {
        val repo = FakeFeedbackRepository(SubmitFeedbackResult.Ok("FB-X"))
        val submit = SubmitFeedback(repo)
        val result = submit(
            FeedbackDraft(category = FeedbackCategory.BUG, message = "   "),
            authenticated = false,
        )
        assertTrue(result is SubmitFeedbackResult.Invalid)
        assertEquals(0, repo.calls)
    }
}
