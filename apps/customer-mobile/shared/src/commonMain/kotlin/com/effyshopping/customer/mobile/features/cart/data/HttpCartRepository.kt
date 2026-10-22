package com.effyshopping.customer.mobile.features.cart.data

import com.effyshopping.customer.mobile.commerce.contract.AddToCartRequest
import com.effyshopping.customer.mobile.commerce.contract.ApplyPromoRequest
import com.effyshopping.customer.mobile.commerce.contract.CartBlockedReason
import com.effyshopping.customer.mobile.commerce.contract.CartDTO
import com.effyshopping.customer.mobile.commerce.contract.CartLineDTO
import com.effyshopping.customer.mobile.commerce.contract.CartLineInput
import com.effyshopping.customer.mobile.commerce.contract.CartNoticeKind
import com.effyshopping.customer.mobile.commerce.contract.CartPolicyDTO
import com.effyshopping.customer.mobile.commerce.contract.CartPreviewRequest
import com.effyshopping.customer.mobile.commerce.contract.MergeCartRequest
import com.effyshopping.customer.mobile.commerce.contract.ReorderRequest
import com.effyshopping.customer.mobile.commerce.contract.ReorderResultDTO
import com.effyshopping.customer.mobile.commerce.contract.ReorderSkipReason
import com.effyshopping.customer.mobile.commerce.contract.UpdateCartLineRequest
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.http.ensureSuccess
import com.effyshopping.customer.mobile.features.catalog.data.toDomain
import com.effyshopping.customer.mobile.features.cart.domain.CartBlockedReason as DomainBlockedReason
import com.effyshopping.customer.mobile.features.cart.domain.CartCheckout
import com.effyshopping.customer.mobile.features.cart.domain.CartDiscount
import com.effyshopping.customer.mobile.features.cart.domain.CartPromotionLine
import com.effyshopping.customer.mobile.features.cart.domain.CartPromotionNotApplied
import com.effyshopping.customer.mobile.features.cart.domain.CartLimits
import com.effyshopping.customer.mobile.features.cart.domain.CartNotice
import com.effyshopping.customer.mobile.features.cart.domain.CartNoticeKind as DomainNoticeKind
import com.effyshopping.customer.mobile.features.cart.domain.CartPolicy
import com.effyshopping.customer.mobile.features.cart.domain.CartRepository
import com.effyshopping.customer.mobile.features.cart.domain.CartSnapshot
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartLine
import com.effyshopping.customer.mobile.features.cart.domain.PendingLine
import com.effyshopping.customer.mobile.features.cart.domain.ReorderOutcome
import com.effyshopping.customer.mobile.features.cart.domain.ReorderSkipReason as DomainSkipReason
import com.effyshopping.customer.mobile.features.cart.domain.ReorderSkipped
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
 * The cart over the `commerce` service (070) — the platform's one backend. Until 070 these were `v1/…`
 * routes on a second, always-on backend; the paths moved under the service prefix and the wire
 * shapes did not change.
 *
 * Every method maps the wire DTO to the domain explicitly (Principle VI: wire shapes never leak past the
 * data layer). Every mutation returns the COMPLETE re-priced cart, which is why none of these methods
 * returns Unit — the platform's answer IS the new truth, and the mirror adopts it by revision.
 *
 * ⚠ 019's `replace` (PUT cart) is gone. See [CartRepository] for why its absence is load-bearing.
 */
class HttpCartRepository(private val edge: HttpClient) : CartRepository {

    override suspend fun get(): CartSnapshot = request {
        edge.get("commerce/v1/cart").ensureSuccess().body<CartDTO>().toDomain()
    }

    override suspend fun add(variantId: String, quantity: Int, changeId: String): CartSnapshot = request {
        edge.post("commerce/v1/cart/items") {
            setBody(
                AddToCartRequest(
                    variantID = variantId,
                    quantity = quantity.toLong(),
                    changeID = changeId,
                ),
            )
        }.ensureSuccess().body<CartDTO>().toDomain()
    }

    override suspend fun setQuantity(variantId: String, quantity: Int, changeId: String): CartSnapshot = request {
        edge.patch("commerce/v1/cart/items/$variantId") {
            setBody(UpdateCartLineRequest(quantity = quantity.toLong(), changeID = changeId))
        }.ensureSuccess().body<CartDTO>().toDomain()
    }

    override suspend fun remove(variantId: String, changeId: String): CartSnapshot = request {
        edge.delete("commerce/v1/cart/items/$variantId") { parameter("changeId", changeId) }
            .ensureSuccess().body<CartDTO>().toDomain()
    }

    override suspend fun clear(changeId: String): CartSnapshot = request {
        edge.delete("commerce/v1/cart") { parameter("changeId", changeId) }
            .ensureSuccess().body<CartDTO>().toDomain()
    }

    override suspend fun merge(lines: List<PendingLine>, changeId: String): CartSnapshot = request {
        edge.post("commerce/v1/cart/merge") {
            setBody(MergeCartRequest(lines = lines.map { it.toInput() }, changeID = changeId))
        }.ensureSuccess().body<CartDTO>().toDomain()
    }

    override suspend fun reorder(orderId: String, changeId: String): ReorderOutcome = request {
        val dto = edge.post("commerce/v1/cart/reorder") {
            setBody(ReorderRequest(orderID = orderId, changeID = changeId))
        }.ensureSuccess().body<ReorderResultDTO>()
        ReorderOutcome(
            cart = dto.cart.toDomain(),
            skipped = dto.skipped.map {
                ReorderSkipped(
                    productId = it.productID,
                    variantId = it.variantID,
                    variantLabel = it.variantLabel,
                    name = it.name,
                    reason = it.reason.toDomain(),
                )
            },
        )
    }

    override suspend fun setAside(variantId: String, changeId: String): CartSnapshot = request {
        edge.post("commerce/v1/cart/items/$variantId/set-aside") { parameter("changeId", changeId) }
            .ensureSuccess().body<CartDTO>().toDomain()
    }

    override suspend fun restoreSaved(variantId: String, changeId: String): CartSnapshot = request {
        edge.post("commerce/v1/cart/saved/$variantId/restore") { parameter("changeId", changeId) }
            .ensureSuccess().body<CartDTO>().toDomain()
    }

    override suspend fun deleteSaved(variantId: String, changeId: String): CartSnapshot = request {
        edge.delete("commerce/v1/cart/saved/$variantId") { parameter("changeId", changeId) }
            .ensureSuccess().body<CartDTO>().toDomain()
    }

    override suspend fun applyPromo(code: String): CartSnapshot = request {
        edge.post("commerce/v1/cart/promo") { setBody(ApplyPromoRequest(code = code)) }
            .ensureSuccess().body<CartDTO>().toDomain()
    }

    override suspend fun removePromo(): CartSnapshot = request {
        edge.delete("commerce/v1/cart/promo").ensureSuccess().body<CartDTO>().toDomain()
    }

    override suspend fun preview(lines: List<PendingLine>): CartSnapshot = request {
        edge.post("commerce/v1/cart/preview") {
            setBody(CartPreviewRequest(lines = lines.map { it.toInput() }))
        }.ensureSuccess().body<CartDTO>().toDomain()
    }

    override suspend fun policy(): CartPolicy = request {
        edge.get("commerce/v1/cart/policy").ensureSuccess().body<CartPolicyDTO>().let {
            CartPolicy(
                minimumSubtotalAmount = it.minimumSubtotalAmount,
                currency = it.currency,
                maxLineQuantity = it.maxLineQuantity.toInt(),
                maxDistinctItems = it.maxDistinctItems.toInt(),
            )
        }
    }

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

// ── Wire → domain ───────────────────────────────────────────────────────────────────────────────
//
// The contract declares counts, quantities, limits and the revision as `WireInt` (`@asType integer`), so
// the generated Kotlin types them `Long` and a whole number goes on the wire. That matters in the REQUEST
// direction: before 027 they were `Double`, kotlinx sent `"quantity":1.0`, and Go's `encoding/json` cannot
// unmarshal `1.0` into an `int` — so every mobile cart write answered 422 (research R13). They are narrowed
// to `Int` here, once, at the boundary; nothing above the data layer deals in wire widths.

private fun PendingLine.toInput() = CartLineInput(variantID = variantId, quantity = quantity.toLong())

private fun CartDTO.toDomain() = CartSnapshot(
    revision = revision.toLong(),
    lines = lines.map { it.toDomain(currency) },
    savedLines = savedLines.map { it.toDomain(currency) },
    itemSubtotalAmount = itemSubtotalAmount,
    discountAmount = discountAmount,
    grandTotalAmount = grandTotalAmount,
    currency = currency,
    notices = notices.map {
        CartNotice(productId = it.productID, variantId = it.variantID, kind = it.kind.toDomain(), detail = it.detail)
    },
    discount = discount?.let {
        CartDiscount(code = it.code, kind = it.kind.value, amount = it.amount, label = it.label)
    },
    promotions = promotions.orEmpty().map {
        CartPromotionLine(promotionId = it.promotionID, headline = it.headline, code = it.code, goodsAmount = it.goodsAmount)
    },
    promotionsNotApplied = promotionsNotApplied.orEmpty().map {
        CartPromotionNotApplied(promotionId = it.promotionID, headline = it.headline, detail = it.detail)
    },
    checkout = CartCheckout(
        allowed = checkout.allowed,
        blockedReason = checkout.blockedReason?.toDomain(),
        minimumSubtotalAmount = checkout.minimumSubtotalAmount,
        remainingAmount = checkout.remainingAmount,
    ),
    limits = CartLimits(
        maxLineQuantity = limits.maxLineQuantity.toInt(),
        maxDistinctItems = limits.maxDistinctItems.toInt(),
    ),
)

private fun CartLineDTO.toDomain(cartCurrency: String) = GuestCartLine(
    variantId = variantID,
    productId = productID,
    name = name,
    variantLabel = variantLabel,
    unitPrice = unitPrice?.toDomain(),
    imageUrl = imageURL,
    unitPriceAmount = unitPriceAmount,
    currency = cartCurrency,
    quantity = quantity.toInt(),
    packageKey = packageKey,
    available = available,
    priceChangedFrom = priceChangedFrom,
)

private fun CartNoticeKind.toDomain(): DomainNoticeKind = when (this) {
    CartNoticeKind.Unavailable -> DomainNoticeKind.Unavailable
    CartNoticeKind.PriceChanged -> DomainNoticeKind.PriceChanged
    CartNoticeKind.Removed -> DomainNoticeKind.Removed
    CartNoticeKind.QuantityClamped -> DomainNoticeKind.QuantityClamped
    CartNoticeKind.CartFull -> DomainNoticeKind.CartFull
    CartNoticeKind.PromoNoLongerApplies -> DomainNoticeKind.PromoNoLongerApplies
}

private fun CartBlockedReason.toDomain(): DomainBlockedReason = when (this) {
    CartBlockedReason.Empty -> DomainBlockedReason.Empty
    CartBlockedReason.NoPayableItems -> DomainBlockedReason.NoPayableItems
    CartBlockedReason.BelowMinimum -> DomainBlockedReason.BelowMinimum
}

private fun ReorderSkipReason.toDomain(): DomainSkipReason = when (this) {
    ReorderSkipReason.Unavailable -> DomainSkipReason.Unavailable
    ReorderSkipReason.Removed -> DomainSkipReason.Removed
    ReorderSkipReason.CartFull -> DomainSkipReason.CartFull
    ReorderSkipReason.Clamped -> DomainSkipReason.Clamped
}
