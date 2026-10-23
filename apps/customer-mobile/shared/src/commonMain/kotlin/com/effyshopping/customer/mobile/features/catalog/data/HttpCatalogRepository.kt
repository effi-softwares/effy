package com.effyshopping.customer.mobile.features.catalog.data

import com.effyshopping.customer.mobile.commerce.contract.FacetSetDTO
import com.effyshopping.customer.mobile.commerce.contract.ProductSearchResultDTO
import com.effyshopping.customer.mobile.commerce.contract.PromotionDTO
import com.effyshopping.customer.mobile.commerce.contract.ShopperPromotionDTO
import com.effyshopping.customer.mobile.commerce.contract.StorefrontCategoryDTO
import com.effyshopping.customer.mobile.commerce.contract.StorefrontHomeDTO
import com.effyshopping.customer.mobile.commerce.contract.StorefrontProductDetailDTO
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.http.effyJson
import com.effyshopping.customer.mobile.core.http.ensureSuccess
import com.effyshopping.customer.mobile.features.catalog.domain.BannerPlacement
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
import io.ktor.http.isSuccess
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.JsonElement
import kotlinx.io.IOException

/**
 * The catalog over the `storefront` service. These reads are public; the client adds auth headers only when
 * signed in, which the public routes ignore. Transport failures become `AppError.Network` via [request].
 */
private const val HOME_HERO = "home-hero"
private const val HOME_BETWEEN = "home-between"

class HttpCatalogRepository(private val edge: HttpClient) : CatalogRepository {

    /**
     * Home's rails from the storefront, and its promotions from the display groups (`home-hero`
     * for the carousel, `home-between` between sections), so back-office decides what appears where.
     * A failed group read keeps the rails and the server's own banners: promotions never take Home down.
     */
    override suspend fun home(): HomeContent = request {
        val home = edge.get("storefront/v1/home").ensureSuccess().body<StorefrontHomeDTO>().toDomain()
        val groups = runCatching { promotionGroups(listOf(HOME_HERO, HOME_BETWEEN)) }.getOrNull() ?: return@request home
        home.copy(
            banners = groups[HOME_HERO].orEmpty().mapIndexed { i, p -> p.toBanner(BannerPlacement.CAROUSEL, i) } +
                groups[HOME_BETWEEN].orEmpty().mapIndexed { i, p -> p.toBanner(BannerPlacement.INLINE, i) },
        )
    }

    /**
     * Display groups by key. Signed in, commerce answers with the shopper's personal offers (first
     * order, chosen customers); signed out — or when commerce refuses — the storefront's public answer.
     */
    private suspend fun promotionGroups(keys: List<String>): Map<String, List<ShopperPromotionDTO>> {
        val joined = keys.joinToString(",")
        val personal = edge.get("commerce/v1/promotion-groups") { parameter("keys", joined) }
        val response = if (personal.status.isSuccess()) personal
        else edge.get("storefront/v1/promotion-groups") { parameter("keys", joined) }.ensureSuccess()
        // Read leniently: a skin this build does not understand must not cost it the promotion.
        return decodePromotionGroups(effyJson, response.body<JsonElement>())
    }

    override suspend fun categories(): List<Category> = request {
        edge.get("storefront/v1/categories").ensureSuccess().body<List<StorefrontCategoryDTO>>().map { it.toDomain() }
    }

    override suspend fun productDetail(id: String): ProductDetail = request {
        edge.get("storefront/v1/products/$id").ensureSuccess().body<StorefrontProductDetailDTO>().toDomain()
    }

    /**
     * Re-read at tap time: a promotion can end while Home is on screen. The server applies Home's
     * visibility rule, so one no longer live is a 404, which the screen shows as not found.
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
            // A cursor is minted under one ordering and the server rejects it under another (400
            // cursor_sort_mismatch, FR-016b). Callers must drop the cursor when the sort changes
            // which they do by restarting the list, the same thing the UI does anyway.
            if (cursor != null) parameter("cursor", cursor)
            parameter("limit", "24")
        }.ensureSuccess().body<ProductSearchResultDTO>()
        ProductPage(
            items = dto.items.map { it.toDomain() },
            nextCursor = dto.nextCursor,
            total = dto.total.toInt(),
            // The ordering the server applied, which may differ from the request.
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
     * The filter query params shared by search and facets. Repeated `brand` / `attr.<key>`
     * params encode OR-within-a-facet; `parameter` appends, so multiple calls produce multiple params.
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
