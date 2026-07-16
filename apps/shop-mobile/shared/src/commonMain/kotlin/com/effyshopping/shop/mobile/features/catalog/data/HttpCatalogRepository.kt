package com.effyshopping.shop.mobile.features.catalog.data

import com.effyshopping.shop.mobile.contract.CreatePresignedUploadRequest
import com.effyshopping.shop.mobile.contract.CreatePresignedUploadResponse
import com.effyshopping.shop.mobile.contract.CatalogSchemaDTO
import com.effyshopping.shop.mobile.contract.ProductDetailDTO
import com.effyshopping.shop.mobile.contract.ProductListDTO
import com.effyshopping.shop.mobile.contract.ProductMediaDTO
import com.effyshopping.shop.mobile.contract.RegisterMediaRequest
import com.effyshopping.shop.mobile.contract.SetProductSectionsRequest
import com.effyshopping.shop.mobile.contract.ShopSectionDTO
import com.effyshopping.shop.mobile.core.error.AppError
import com.effyshopping.shop.mobile.core.error.AppException
import com.effyshopping.shop.mobile.core.http.ensureSuccess
import com.effyshopping.shop.mobile.features.catalog.domain.CatalogRepository
import com.effyshopping.shop.mobile.features.catalog.domain.CatalogSchema
import com.effyshopping.shop.mobile.features.catalog.domain.NewProduct
import com.effyshopping.shop.mobile.features.catalog.domain.PresignedUpload
import com.effyshopping.shop.mobile.features.catalog.domain.ProductDetail
import com.effyshopping.shop.mobile.features.catalog.domain.ProductMedia
import com.effyshopping.shop.mobile.features.catalog.domain.ProductPage
import com.effyshopping.shop.mobile.features.catalog.domain.ProductPatch
import com.effyshopping.shop.mobile.features.catalog.domain.ProductQuery
import com.effyshopping.shop.mobile.features.catalog.domain.ProductStatus
import com.effyshopping.shop.mobile.features.catalog.domain.ShopSection
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException

/**
 * The catalog repository over `edge-api/shop` (016 R13). [shopApi] is the container's shop client — the
 * SAME single-bearer client the operator record uses (cross-pool isolation, FR-029) — so every call here is
 * automatically authorized and scoped to the operator's shop by the backend. Paths are RELATIVE to the
 * client's base url (`shop/v1/...`). Non-2xx → the mapped `AppException` via [ensureSuccess]; transport
 * failures → `AppError.Network`; anything unforeseen → `AppError.Unexpected` (no SDK/HTTP text leaks).
 */
class HttpCatalogRepository(private val shopApi: HttpClient) : CatalogRepository {

    override suspend fun getCatalogSchema(): CatalogSchema = request {
        shopApi.get("shop/v1/catalog/schema").ensureSuccess().body<CatalogSchemaDTO>().toDomain()
    }

    override suspend fun listProducts(query: ProductQuery): ProductPage = request {
        shopApi.get("shop/v1/products") {
            // Only non-null filters are sent; the backend computes the page + total (FR-017).
            parameter("page", query.page)
            parameter("pageSize", query.pageSize)
            query.q?.takeIf { it.isNotBlank() }?.let { parameter("q", it) }
            query.type?.let { parameter("type", it) }
            query.category?.let { parameter("category", it) }
            query.section?.let { parameter("section", it) }
            query.status?.let { parameter("status", it.key) }
            query.priceMin?.let { parameter("priceMin", it) }
            query.priceMax?.let { parameter("priceMax", it) }
            query.sort?.let { parameter("sort", it.key) }
            query.order?.let { parameter("order", it.key) }
        }.ensureSuccess().body<ProductListDTO>().toDomain()
    }

    override suspend fun getProduct(id: String): ProductDetail = request {
        shopApi.get("shop/v1/products/$id").ensureSuccess().body<ProductDetailDTO>().toDomain()
    }

    override suspend fun createProduct(input: NewProduct): ProductDetail = request {
        shopApi.post("shop/v1/products") { setBody(input.toRequest()) }
            .ensureSuccess().body<ProductDetailDTO>().toDomain()
    }

    override suspend fun updateProduct(id: String, patch: ProductPatch): ProductDetail = request {
        shopApi.patch("shop/v1/products/$id") { setBody(patch.toRequest()) }
            .ensureSuccess().body<ProductDetailDTO>().toDomain()
    }

    override suspend fun changeStatus(id: String, status: ProductStatus): ProductDetail = request {
        shopApi.post("shop/v1/products/$id/status") { setBody(status.toStatusRequest()) }
            .ensureSuccess().body<ProductDetailDTO>().toDomain()
    }

    override suspend fun deleteProduct(id: String) = request {
        // 204 on success; 409 (→ AppError.Conflict) means "referenced/published — archive instead" (R8).
        shopApi.delete("shop/v1/products/$id").ensureSuccess()
        Unit
    }

    override suspend fun listSections(): List<ShopSection> = request {
        shopApi.get("shop/v1/sections").ensureSuccess().body<List<ShopSectionDTO>>().map { it.toDomain() }
    }

    override suspend fun setSections(id: String, sectionIds: List<String>): ProductDetail = request {
        shopApi.patch("shop/v1/products/$id/sections") { setBody(SetProductSectionsRequest(sectionIDS = sectionIds)) }
            .ensureSuccess().body<ProductDetailDTO>().toDomain()
    }

    override suspend fun presignUpload(productId: String, contentType: String, fileSize: Long): PresignedUpload =
        request {
            val dto = shopApi.post("shop/v1/products/$productId/media") {
                setBody(CreatePresignedUploadRequest(contentType = contentType, fileSize = fileSize.toDouble()))
            }.ensureSuccess().body<CreatePresignedUploadResponse>()
            PresignedUpload(uploadUrl = dto.uploadURL, storageKey = dto.storageKey)
        }

    override suspend fun registerMedia(
        productId: String,
        storageKey: String,
        isPrimary: Boolean,
        altText: String?,
    ): ProductMedia = request {
        shopApi.post("shop/v1/products/$productId/media/register") {
            setBody(RegisterMediaRequest(storageKey = storageKey, isPrimary = isPrimary, altText = altText))
        }.ensureSuccess().body<ProductMediaDTO>().let {
            ProductMedia(
                id = it.id,
                storageKey = it.storageKey,
                url = it.url,
                isPrimary = it.isPrimary,
                displayOrder = it.displayOrder.toInt(),
                altText = it.altText,
            )
        }
    }

    /** Uniform failure mapping (mirrors `HttpShopRepository`): AppException passes through; IO → Network. */
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
