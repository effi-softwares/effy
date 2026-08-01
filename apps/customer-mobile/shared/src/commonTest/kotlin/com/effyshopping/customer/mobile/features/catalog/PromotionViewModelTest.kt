package com.effyshopping.customer.mobile.features.catalog

import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.features.catalog.domain.GetPromotion
import com.effyshopping.customer.mobile.features.catalog.domain.CatalogRepository
import com.effyshopping.customer.mobile.features.catalog.domain.Category
import com.effyshopping.customer.mobile.features.catalog.domain.HomeContent
import com.effyshopping.customer.mobile.features.catalog.domain.ProductDetail
import com.effyshopping.customer.mobile.features.catalog.domain.ProductPage
import com.effyshopping.customer.mobile.features.catalog.domain.ProductSortOption
import com.effyshopping.customer.mobile.features.catalog.domain.Promotion
import com.effyshopping.customer.mobile.features.catalog.domain.Serviceability
import com.effyshopping.customer.mobile.features.catalog.presentation.PromotionUiState
import com.effyshopping.customer.mobile.features.catalog.presentation.PromotionViewModel
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
import kotlin.test.assertTrue

private val PROMO = Promotion(
    id = "p1",
    title = "20% off your first order",
    subtitle = "Stock up",
    imageUrl = null,
    code = "FIRST20",
    terms = "On orders over \$30.00",
    validity = "Ends in 3 days",
)

private class FakePromoCatalog(private val result: () -> Promotion) : CatalogRepository {
    var reads = 0
    override suspend fun home() = HomeContent(emptyList(), emptyList())
    override suspend fun categories(): List<Category> = emptyList()
    override suspend fun productDetail(id: String): ProductDetail = throw NotImplementedError()
    override suspend fun search(
        query: String,
        saleOnly: Boolean,
        categoryKey: String?,
        sort: ProductSortOption,
        cursor: String?,
    ): ProductPage = throw NotImplementedError()

    override suspend fun serviceability(postcode: String) =
        Serviceability(postcode = postcode, serviced = true)

    override suspend fun promotion(id: String): Promotion {
        reads++
        return result()
    }
}

/**
 * What the promotion detail does with what it is handed.
 *
 * ⚠ The behaviour under test is mostly about REFUSALS, because that is where the value is. A shopper
 * who taps a banner for a promotion that was claimed out from under them while they scrolled must be
 * told it has ended — not shown terms that are void, and not invited to retry something that will
 * never succeed.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PromotionViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @BeforeTest
    fun setUp() = Dispatchers.setMain(dispatcher)

    @AfterTest
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `it loads the promotion it was opened for`() = runTest(dispatcher) {
        val repo = FakePromoCatalog { PROMO }
        val vm = PromotionViewModel("p1", GetPromotion(repo))
        advanceUntilIdle()

        val state = vm.state.value
        assertTrue(state is PromotionUiState.Ready, "expected Ready, got $state")
        assertEquals("FIRST20", state.promotion.code)
        // ⚠ It must actually go and read. Building the screen from the banner already on screen would
        // be cheaper and would happily show terms for a promotion that had since ended.
        assertEquals(1, repo.reads)
    }

    /**
     * 404 is the answer for BOTH "never existed" and "no longer advertised" — deliberately, so nobody
     * can enumerate the operator's private codes. The screen therefore treats it as "this offer has
     * ended", which is the only reading a shopper who arrived from a live banner can act on.
     */
    @Test
    fun `a promotion that is gone is Unavailable rather than an error`() = runTest(dispatcher) {
        val vm = PromotionViewModel("p1", GetPromotion(FakePromoCatalog { throw AppException(AppError.NotFound) }))
        advanceUntilIdle()

        assertEquals(PromotionUiState.Unavailable, vm.state.value)
    }

    /**
     * The distinction that earns [PromotionUiState.Unavailable] its existence: a network failure is
     * worth retrying and an ended promotion is not. Collapsing them would either invite a retry that
     * can never work, or tell someone with flaky signal that their discount is gone.
     */
    @Test
    fun `a transport failure is Failed - the retryable one`() = runTest(dispatcher) {
        val vm = PromotionViewModel("p1", GetPromotion(FakePromoCatalog { throw AppException(AppError.Network) }))
        advanceUntilIdle()

        assertEquals(PromotionUiState.Failed, vm.state.value)
    }

    @Test
    fun `refresh keeps what is on screen when the network blips`() = runTest(dispatcher) {
        var fail = false
        val repo = FakePromoCatalog { if (fail) throw AppException(AppError.Network) else PROMO }
        val vm = PromotionViewModel("p1", GetPromotion(repo))
        advanceUntilIdle()

        fail = true
        vm.refresh()
        advanceUntilIdle()

        assertTrue(
            vm.state.value is PromotionUiState.Ready,
            "a failed pull-to-refresh must not replace a promotion the shopper is reading with an error",
        )
    }

    /**
     * The one case where refresh DOES replace what is on screen. Keeping void terms visible because
     * "the shopper is looking at them" is the worse outcome — they would take a dead code to the cart.
     */
    @Test
    fun `refresh replaces the screen when the promotion has ended`() = runTest(dispatcher) {
        var ended = false
        val repo = FakePromoCatalog { if (ended) throw AppException(AppError.NotFound) else PROMO }
        val vm = PromotionViewModel("p1", GetPromotion(repo))
        advanceUntilIdle()

        ended = true
        vm.refresh()
        advanceUntilIdle()

        assertEquals(PromotionUiState.Unavailable, vm.state.value)
    }
}
