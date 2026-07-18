package com.effyshopping.shop.mobile.features.catalog.presentation

import com.effyshopping.shop.mobile.features.catalog.FakeCatalogRepository
import com.effyshopping.shop.mobile.features.catalog.domain.GetProduct
import com.effyshopping.shop.mobile.features.catalog.domain.ListProducts
import com.effyshopping.shop.mobile.features.catalog.domain.ProductStatus
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
}
