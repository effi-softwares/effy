package com.effyshopping.customer.mobile.features.catalog.data

import com.effyshopping.customer.mobile.commerce.contract.FacetSetDTO
import com.effyshopping.customer.mobile.commerce.contract.ProductSearchResultDTO
import com.effyshopping.customer.mobile.commerce.contract.PromotionDTO
import com.effyshopping.customer.mobile.commerce.contract.StorefrontCategoryDTO
import com.effyshopping.customer.mobile.commerce.contract.StorefrontHomeDTO
import com.effyshopping.customer.mobile.commerce.contract.StorefrontProductDetailDTO
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.http.ensureSuccess
import com.effyshopping.customer.mobile.features.catalog.domain.CatalogRepository
import com.effyshopping.customer.mobile.features.catalog.domain.Category
import com.effyshopping.customer.mobile.features.catalog.domain.FacetSet
import com.effyshopping.customer.mobile.features.catalog.domain.HomeContent
import com.effyshopping.customer.mobile.features.catalog.domain.ProductDetail
import com.effyshopping.customer.mobile.features.catalog.domain.ProductPage
import com.effyshopping.customer.mobile.features.catalog.domain.ProductSortOption
import com.effyshopping.customer.mobile.features.catalog.domain.Promotion
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.parameter
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException

/**
 * The catalog repository over the `storefront` service (070). [edge] is the client built for
 * `EDGE_API_BASE_URL` — the platform's one backend. These reads are PUBLIC (no session needed); the
 * client adds its auth headers only when signed in, which the public routes ignore. Transport
 * failures become `AppError.Network` via [request], exactly like the account repository (013 pattern).
 *
 * ⚠ Until 070 these were `v1/storefront/…` on a second, always-on backend, since retired. The paths
 * moved under the service prefix and the second base URL is gone; the wire shapes did not change.
 */
class HttpCatalogRepository(private val edge: HttpClient) : CatalogRepository {

    override suspend fun home(): HomeContent = request {
        edge.get("storefront/v1/home").ensureSuccess().body<StorefrontHomeDTO>().toDomain()
    }

    override suspend fun categories(): List<Category> = request {
        edge.get("storefront/v1/categories").ensureSuccess().body<List<StorefrontCategoryDTO>>().map { it.toDomain() }
    }

    override suspend fun productDetail(id: String): ProductDetail = request {
        edge.get("storefront/v1/products/$id").ensureSuccess().body<StorefrontProductDetailDTO>().toDomain()
    }

    /**
     * ⚠ Re-read at tap time rather than carried over from the banner already on screen. Home is a
     * snapshot: a promotion can expire, be exhausted by other shoppers, or be withdrawn while a
     * shopper scrolls. The server applies the same visibility predicate it used for Home, so a
     * promotion that is no longer live comes back 404 — and `ensureSuccess` turns that into the
     * not-found error the screen shows, instead of terms that stopped being true.
     */
    override suspend fun promotion(id: String): Promotion = request {
        edge.get("storefront/v1/promotions/$id").ensureSuccess().body<PromotionDTO>().toDomain()
    }

    override suspend fun search(
        query: String,
        saleOnly: Boolean,
        categoryKey: String?,
        sort: ProductSortOption,
        cursor: String?,
        brands: List<String>,
        attributes: Map<String, List<String>>,
        minPrice: String?,
        maxPrice: String?,
    ): ProductPage = request {
        val dto = edge.get("storefront/v1/products") {
            applyFilterParams(query, saleOnly, categoryKey, brands, attributes, minPrice, maxPrice)
            parameter("sort", sort.wire)
            // ⚠ A cursor is minted under ONE ordering and the server rejects it under another (400
            // cursor_sort_mismatch, FR-016b). Callers must drop the cursor when the sort changes —
            // which they do by restarting the list, the same thing the UI does anyway.
            if (cursor != null) parameter("cursor", cursor)
            parameter("limit", "24")
        }.ensureSuccess().body<ProductSearchResultDTO>()
        ProductPage(
            items = dto.items.map { it.toDomain() },
            nextCursor = dto.nextCursor,
            total = dto.total.toInt(),
            // The ordering the server APPLIED, which may differ from the request.
            sort = ProductSortOption.fromWire(dto.sort.value),
        )
    }

    override suspend fun facets(
        query: String,
        saleOnly: Boolean,
        categoryKey: String?,
        brands: List<String>,
        attributes: Map<String, List<String>>,
        minPrice: String?,
        maxPrice: String?,
    ): FacetSet = request {
        edge.get("storefront/v1/facets") {
            applyFilterParams(query, saleOnly, categoryKey, brands, attributes, minPrice, maxPrice)
        }.ensureSuccess().body<FacetSetDTO>().toDomain()
    }

    /**
     * The filter query params shared by search and facets (043). Repeated `brand` / `attr.<key>`
     * params encode OR-within-a-facet; `parameter` APPENDS, so multiple calls produce multiple params.
     */
    private fun HttpRequestBuilder.applyFilterParams(
        query: String,
        saleOnly: Boolean,
        categoryKey: String?,
        brands: List<String>,
        attributes: Map<String, List<String>>,
        minPrice: String?,
        maxPrice: String?,
    ) {
        if (query.isNotBlank()) parameter("q", query)
        if (saleOnly) parameter("saleOnly", "true")
        if (categoryKey != null) parameter("categoryKey", categoryKey)
        if (minPrice != null) parameter("minPrice", minPrice)
        if (maxPrice != null) parameter("maxPrice", maxPrice)
        brands.forEach { parameter("brand", it) }
        attributes.forEach { (key, values) -> values.forEach { parameter("attr.$key", it) } }
    }

    /** Run [block]; turn a transport failure into AppError.Network, re-raise a mapped AppException. */
    private suspend inline fun <T> request(block: () -> T): T =
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: AppException) {
            throw e
        } catch (e: IOException) {
            throw AppException(AppError.Network)
        } catch (e: UnresolvedAddressException) {
            throw AppException(AppError.Network)
        } catch (e: Throwable) {
            throw AppException(AppError.Unexpected)
        }
}
