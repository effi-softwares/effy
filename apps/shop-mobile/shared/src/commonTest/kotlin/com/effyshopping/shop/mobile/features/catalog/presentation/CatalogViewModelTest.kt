package com.effyshopping.shop.mobile.features.catalog.presentation

import com.effyshopping.shop.mobile.features.catalog.FakeCatalogRepository
import com.effyshopping.shop.mobile.features.catalog.domain.GetProduct
import com.effyshopping.shop.mobile.features.catalog.domain.ListProducts
import com.effyshopping.shop.mobile.core.error.AppError
import com.effyshopping.shop.mobile.features.catalog.domain.ProductStatus
import com.effyshopping.shop.mobile.features.catalog.domain.ReviewState
import com.effyshopping.shop.mobile.features.catalog.domain.SubmitProductForReview
import com.effyshopping.shop.mobile.features.catalog.domain.WithdrawProductReview
import com.effyshopping.shop.mobile.features.catalog.sampleDetail
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

@OptIn(ExperimentalCoroutinesApi::class)
class CatalogViewModelTest {
    @Test
    fun initial_load_reads_real_catalog_use_cases_and_selects_first_product() = runTest {
        val repo = FakeCatalogRepository()
        val vm = CatalogViewModel(ListProducts(repo), GetProduct(repo), this)

        runCurrent()

        assertEquals(1, vm.state.value.products.size)
        assertEquals("p1", vm.state.value.selectedId)
        assertEquals("Chicken Biryani", vm.state.value.detail?.name)
        assertEquals(null, repo.lastQuery?.status)
    }

    @Test
    fun status_filter_reloads_backend_page_with_status_query() = runTest {
        val repo = FakeCatalogRepository()
        val vm = CatalogViewModel(ListProducts(repo), GetProduct(repo), this)
        runCurrent()

        vm.selectFilter(CatalogFilter.ACTIVE)
        runCurrent()

        assertEquals(ProductStatus.ACTIVE, repo.lastQuery?.status)
        assertEquals(CatalogFilter.ACTIVE, vm.state.value.filter)
    }

    // ── 067: a shop submits; it does not publish ────────────────────────────────────────────────

    private fun reviewVm(repo: FakeCatalogRepository, scope: kotlinx.coroutines.CoroutineScope) =
        CatalogViewModel(ListProducts(repo), GetProduct(repo), scope, SubmitProductForReview(repo), WithdrawProductReview(repo))

    @Test
    fun the_review_action_follows_the_review_state_and_is_never_publish() {
        val base = sampleDetail()
        assertEquals(ReviewAction.SUBMIT, reviewActionFor(base.copy(reviewState = ReviewState.DRAFT)))
        assertEquals(ReviewAction.RESUBMIT, reviewActionFor(base.copy(reviewState = ReviewState.SENT_BACK)))
        assertEquals(ReviewAction.WITHDRAW, reviewActionFor(base.copy(reviewState = ReviewState.IN_REVIEW)))
        assertEquals(ReviewAction.DISCARD_CHANGE, reviewActionFor(base.copy(reviewState = ReviewState.LIVE_CHANGE_PENDING)))
        assertEquals(null, reviewActionFor(base.copy(reviewState = ReviewState.LIVE)))
        ReviewAction.entries.forEach { assertEquals(false, it.label.contains("publish", ignoreCase = true)) }
    }

    @Test
    fun submitting_a_draft_sends_it_for_review_and_updates_the_row_and_the_detail() = runTest {
        val repo = FakeCatalogRepository(
            product = sampleDetail().copy(status = ProductStatus.DRAFT, reviewState = ReviewState.DRAFT),
        )
        val vm = reviewVm(repo, this)
        runCurrent()

        vm.runReviewAction()
        runCurrent()

        assertEquals("p1", repo.submittedId)
        assertEquals(ReviewState.IN_REVIEW, vm.state.value.detail?.reviewState)
        assertEquals(ReviewState.IN_REVIEW, vm.state.value.products.first().reviewState)
        assertEquals(false, vm.state.value.isActing)
        assertEquals(ReviewAction.SUBMIT.doneMessage, vm.state.value.reviewMessage)
    }

    @Test
    fun discarding_a_pending_change_leaves_the_product_live() = runTest {
        val repo = FakeCatalogRepository(product = sampleDetail().copy(reviewState = ReviewState.LIVE_CHANGE_PENDING))
        val vm = reviewVm(repo, this)
        runCurrent()

        vm.runReviewAction()
        runCurrent()

        assertEquals("p1", repo.withdrawnId)
        assertEquals(ReviewState.LIVE, vm.state.value.detail?.reviewState)
        assertEquals(ProductStatus.ACTIVE, vm.state.value.detail?.status)
    }

    @Test
    fun a_refused_submit_says_what_is_missing_and_sends_nothing_twice() = runTest {
        val repo = FakeCatalogRepository(
            product = sampleDetail().copy(status = ProductStatus.DRAFT, reviewState = ReviewState.DRAFT),
        ).apply { reviewError = AppError.Validation("attributes") }
        val vm = reviewVm(repo, this)
        runCurrent()

        vm.runReviewAction()
        runCurrent()

        assertEquals(null, repo.submittedId)
        assertEquals(ReviewState.DRAFT, vm.state.value.detail?.reviewState)
        assertEquals(true, vm.state.value.reviewMessage?.contains("missing a required detail"))
        // ⚠ Never the server's own sentence.
        assertEquals(false, vm.state.value.reviewMessage?.contains("attributes"))
    }

    @Test
    fun a_live_product_has_no_review_action_to_run() = runTest {
        val repo = FakeCatalogRepository()
        val vm = reviewVm(repo, this)
        runCurrent()

        vm.runReviewAction()
        runCurrent()

        assertEquals(null, repo.submittedId)
        assertEquals(null, repo.withdrawnId)
    }
}
