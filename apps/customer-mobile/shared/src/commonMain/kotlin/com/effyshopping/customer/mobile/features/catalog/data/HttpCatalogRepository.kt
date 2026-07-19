package com.effyshopping.customer.mobile.features.catalog.data

import com.effyshopping.customer.mobile.commerce.contract.ProductSearchResultDTO
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

    override suspend fun search(query: String, saleOnly: Boolean, cursor: String?): ProductPage = request {
        val dto = core.get("v1/storefront/products") {
            if (query.isNotBlank()) parameter("q", query)
            if (saleOnly) parameter("saleOnly", "true")
            if (cursor != null) parameter("cursor", cursor)
            parameter("limit", "24")
        }.ensureSuccess().body<ProductSearchResultDTO>()
        ProductPage(items = dto.items.map { it.toDomain() }, nextCursor = dto.nextCursor)
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
