package com.effyshopping.customer.mobile.features.catalog.data

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
import com.effyshopping.customer.mobile.features.catalog.domain.HomeContent
import com.effyshopping.customer.mobile.features.catalog.domain.ProductDetail
import com.effyshopping.customer.mobile.features.catalog.domain.ProductPage
import com.effyshopping.customer.mobile.features.catalog.domain.ProductSortOption
import com.effyshopping.customer.mobile.features.catalog.domain.Promotion
import io.ktor.client.request.parameter
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException

/**
 * The catalog repository over the CORE api (019 US1 — the hot path, the routing law). [core] is the
 * client built for `CORE_API_BASE_URL`. These reads are PUBLIC (no session needed); the two-token
 * plugin adds headers only when signed in, which the public routes ignore. Transport failures become
 * `AppError.Network` via [request], exactly like the account repository (013 pattern).
 */
class HttpCatalogRepository(private val core: HttpClient) : CatalogRepository {

    override suspend fun home(): HomeContent = request {
        core.get("v1/storefront/home").ensureSuccess().body<StorefrontHomeDTO>().toDomain()
    }

    override suspend fun categories(): List<Category> = request {
        core.get("v1/storefront/categories").ensureSuccess().body<List<StorefrontCategoryDTO>>().map { it.toDomain() }
    }

    override suspend fun productDetail(id: String): ProductDetail = request {
        core.get("v1/storefront/products/$id").ensureSuccess().body<StorefrontProductDetailDTO>().toDomain()
    }

    /**
     * ⚠ Re-read at tap time rather than carried over from the banner already on screen. Home is a
     * snapshot: a promotion can expire, be exhausted by other shoppers, or be withdrawn while a
     * shopper scrolls. The server applies the same visibility predicate it used for Home, so a
     * promotion that is no longer live comes back 404 — and `ensureSuccess` turns that into the
     * not-found error the screen shows, instead of terms that stopped being true.
     */
    override suspend fun promotion(id: String): Promotion = request {
        core.get("v1/storefront/promotions/$id").ensureSuccess().body<PromotionDTO>().toDomain()
    }

    override suspend fun search(
        query: String,
        saleOnly: Boolean,
        categoryKey: String?,
        sort: ProductSortOption,
        cursor: String?,
    ): ProductPage = request {
        val dto = core.get("v1/storefront/products") {
            if (query.isNotBlank()) parameter("q", query)
            if (saleOnly) parameter("saleOnly", "true")
            if (categoryKey != null) parameter("categoryKey", categoryKey)
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
