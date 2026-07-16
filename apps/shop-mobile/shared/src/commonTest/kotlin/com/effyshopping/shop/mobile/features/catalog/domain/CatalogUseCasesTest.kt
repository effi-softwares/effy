package com.effyshopping.shop.mobile.features.catalog.domain

import com.effyshopping.shop.mobile.features.catalog.FakeCatalogRepository
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The catalog use cases are thin — the value they earn is being trivially provable over a fake repository
 * (no HTTP, no Amplify). We prove each intent reaches the boundary with the exact arguments and returns the
 * mapped domain (the real logic — validation, pagination — is the backend's, not tested here).
 */
class CatalogUseCasesTest {

    @Test
    fun list_products_passes_the_query_through() = runTest {
        val repo = FakeCatalogRepository()
        val query = ProductQuery(q = "milk", status = ProductStatus.ACTIVE, page = 2, pageSize = 50)
        val page = ListProducts(repo)(query)
        assertEquals(query, repo.lastQuery)
        assertEquals(1, page.items.size)
    }

    @Test
    fun get_catalog_schema_returns_the_active_schema() = runTest {
        val repo = FakeCatalogRepository()
        val schema = GetCatalogSchema(repo)()
        assertEquals(1, schema.productTypes.size)
        assertEquals("Prepared Food", schema.productTypes.first().name)
    }

    @Test
    fun create_product_forwards_the_input() = runTest {
        val repo = FakeCatalogRepository()
        val input = NewProduct(name = "Latte", shortDescription = "Hot", priceAmount = "5.00", primaryCategoryId = "cat-1", productTypeId = "type-1")
        CreateProduct(repo)(input)
        assertEquals(input, repo.lastCreated)
    }

    @Test
    fun update_product_carries_the_expected_updated_at_token() = runTest {
        val repo = FakeCatalogRepository()
        UpdateProduct(repo)("p1", ProductPatch(expectedUpdatedAt = "TOKEN-42", name = "New name"))
        assertEquals("TOKEN-42", repo.lastPatch?.expectedUpdatedAt)
        assertEquals("New name", repo.lastPatch?.name)
    }

    @Test
    fun change_status_forwards_the_target_status() = runTest {
        val repo = FakeCatalogRepository()
        val updated = ChangeProductStatus(repo)("p1", ProductStatus.ARCHIVED)
        assertEquals(ProductStatus.ARCHIVED, repo.lastStatus)
        assertEquals(ProductStatus.ARCHIVED, updated.status)
    }

    @Test
    fun delete_records_the_id_when_unguarded() = runTest {
        val repo = FakeCatalogRepository()
        DeleteProduct(repo)("p1")
        assertEquals("p1", repo.deletedId)
    }

    @Test
    fun assign_sections_forwards_the_membership() = runTest {
        val repo = FakeCatalogRepository()
        val updated = AssignSections(repo)("p1", listOf("sec-1", "sec-2"))
        assertEquals(listOf("sec-1", "sec-2"), repo.lastAssigned)
        assertEquals(listOf("sec-1", "sec-2"), updated.sections)
        assertTrue(repo.lastAssigned!!.isNotEmpty())
        assertNull(repo.lastCreated)
    }
}
