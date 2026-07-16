package com.effyshopping.shop.mobile.features.catalog.presentation

import com.effyshopping.mobile.kit.nav.AppNavKey
import com.effyshopping.shop.mobile.core.draft.InMemoryDraftStore
import com.effyshopping.shop.mobile.core.nav.CatalogProductRoute
import com.effyshopping.shop.mobile.core.nav.shopNavJson
import com.effyshopping.shop.mobile.features.catalog.FakeCatalogRepository
import com.effyshopping.shop.mobile.features.catalog.domain.AssignSections
import com.effyshopping.shop.mobile.features.catalog.domain.ChangeProductStatus
import com.effyshopping.shop.mobile.features.catalog.domain.CreateProduct
import com.effyshopping.shop.mobile.features.catalog.domain.DeleteProduct
import com.effyshopping.shop.mobile.features.catalog.domain.GetCatalogSchema
import com.effyshopping.shop.mobile.features.catalog.domain.GetProduct
import com.effyshopping.shop.mobile.features.catalog.domain.ListProducts
import com.effyshopping.shop.mobile.features.catalog.domain.ListShopSections
import com.effyshopping.shop.mobile.features.catalog.domain.UpdateProduct
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.PolymorphicSerializer
import kotlinx.serialization.json.Json
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * ViewModel state transitions (the mobile posture, R14): a `StandardTestDispatcher` stands in for `Main` so
 * `viewModelScope` work is deterministic. We prove the three behaviors the slice hinges on — the create
 * step flow, device-local draft restore (FR-012), the list filter reaching the backend query — plus the
 * concurrent-edit 409 → reload prompt (FR-023a) and the new route's iOS-safe serialization.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CatalogViewModelsTest {

    private val dispatcher = StandardTestDispatcher()
    private val plainJson = Json { encodeDefaults = true }

    @BeforeTest fun setup() { Dispatchers.setMain(dispatcher) }
    @AfterTest fun teardown() { Dispatchers.resetMain() }

    private fun createVm(repo: FakeCatalogRepository, store: InMemoryDraftStore) = CreateViewModel(
        getCatalogSchema = GetCatalogSchema(repo),
        createProduct = CreateProduct(repo),
        draftStore = store,
    )

    @Test
    fun create_step_flow_advances_and_retreats() {
        val vm = createVm(FakeCatalogRepository(), InMemoryDraftStore())
        assertEquals(CreateViewModel.Step.BASICS, vm.state.value.step)
        vm.next()
        assertEquals(CreateViewModel.Step.CLASSIFY, vm.state.value.step)
        vm.next()
        assertEquals(CreateViewModel.Step.ATTRIBUTES, vm.state.value.step)
        vm.back()
        assertEquals(CreateViewModel.Step.CLASSIFY, vm.state.value.step)
    }

    @Test
    fun create_restores_a_device_local_draft_on_open() {
        val saved = ProductDraft(stepOrdinal = 1, name = "Saved latte", priceAmount = "5.50")
        val store = InMemoryDraftStore(plainJson.encodeToString(ProductDraft.serializer(), saved))
        val vm = createVm(FakeCatalogRepository(), store)
        // Restore happens in init, synchronously, BEFORE any dispatch (the whole point of FR-012).
        assertEquals("Saved latte", vm.state.value.draft.name)
        assertEquals("5.50", vm.state.value.draft.priceAmount)
        assertEquals(CreateViewModel.Step.CLASSIFY, vm.state.value.step)
    }

    @Test
    fun create_persists_the_draft_on_every_edit() {
        val store = InMemoryDraftStore()
        val vm = createVm(FakeCatalogRepository(), store)
        vm.onName("Mango lassi")
        val raw = assertNotNull(store.read(), "an edit must persist the draft")
        val restored = Json { ignoreUnknownKeys = true }.decodeFromString(ProductDraft.serializer(), raw)
        assertEquals("Mango lassi", restored.name)
    }

    @Test
    fun list_filter_reaches_the_backend_query() = runTest(dispatcher) {
        val repo = FakeCatalogRepository()
        val vm = CatalogListViewModel(ListProducts(repo))
        advanceUntilIdle()
        vm.onQueryChange("milk")
        advanceUntilIdle()
        assertEquals("milk", repo.lastQuery?.q)
        assertEquals(1, vm.state.value.items.size)
    }

    @Test
    fun detail_edit_conflict_prompts_reload_not_overwrite() = runTest(dispatcher) {
        val repo = FakeCatalogRepository().apply { conflictOnUpdate = true }
        val vm = DetailViewModel(
            productId = "p1",
            getProduct = GetProduct(repo),
            updateProduct = UpdateProduct(repo),
            changeStatus = ChangeProductStatus(repo),
            deleteProduct = DeleteProduct(repo),
            listSections = ListShopSections(repo),
            assignSections = AssignSections(repo),
        )
        advanceUntilIdle()
        assertNotNull(vm.state.value.product)
        vm.saveEdit({ token -> com.effyshopping.shop.mobile.features.catalog.domain.ProductPatch(expectedUpdatedAt = token, name = "x") }) {}
        advanceUntilIdle()
        assertTrue(vm.state.value.conflict, "a stale expectedUpdatedAt must set the reload prompt")
    }

    @Test
    fun catalog_product_route_round_trips_through_the_shop_module() {
        val route = CatalogProductRoute("prod-42")
        val encoded = shopNavJson.encodeToString(PolymorphicSerializer(AppNavKey::class), route)
        val restored = shopNavJson.decodeFromString(PolymorphicSerializer(AppNavKey::class), encoded)
        assertEquals(route, restored)
    }
}
