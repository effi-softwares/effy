package com.effyshopping.customer.mobile.features.saved.data

import com.effyshopping.customer.mobile.commerce.contract.SavedItemDTO
import com.effyshopping.customer.mobile.commerce.contract.SavedMembershipDTO
import com.effyshopping.customer.mobile.commerce.contract.SavedMergeItem
import com.effyshopping.customer.mobile.commerce.contract.SavedMergeRequest
import com.effyshopping.customer.mobile.commerce.contract.SavedAddToCartRequest
import com.effyshopping.customer.mobile.commerce.contract.SavedAddToCartResultDTO
import com.effyshopping.customer.mobile.commerce.contract.SavedMergeResultDTO
import com.effyshopping.customer.mobile.commerce.contract.SavedVerdict as WireVerdict
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.http.ensureSuccess
import com.effyshopping.customer.mobile.features.saved.domain.SavedItem
import com.effyshopping.customer.mobile.features.saved.domain.SavedGuestEntry
import com.effyshopping.customer.mobile.features.saved.domain.SavedMembership
import com.effyshopping.customer.mobile.features.saved.domain.SavedMergeOutcome
import com.effyshopping.customer.mobile.features.saved.domain.SavedMergeRepository
import com.effyshopping.customer.mobile.features.saved.domain.SavedAddToCartOutcome
import com.effyshopping.customer.mobile.features.saved.domain.SavedCartRepository
import com.effyshopping.customer.mobile.features.saved.domain.SavedMergeSkip
import com.effyshopping.customer.mobile.features.saved.domain.SavedRepository
import com.effyshopping.customer.mobile.features.saved.domain.SavedVerdict
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException
import kotlinx.serialization.Serializable

/**
 * Saved items over the CORE api (the hot path — the routing law, 011 FR-028).
 *
 * Every method maps the wire DTO to the domain explicitly (Principle VI: wire shapes never leak past
 * the data layer).
 */
class HttpSavedRepository(private val core: HttpClient) : SavedRepository, SavedMergeRepository, SavedCartRepository {

    override suspend fun membership(): SavedMembership = request {
        val dto = core.get("v1/saved/ids").ensureSuccess().body<SavedMembershipDTO>()
        SavedMembership(productIds = dto.productIDS.toSet())
    }

    override suspend fun list(postcode: String?): List<SavedItem> = request {
        core.get("v1/saved") {
            // ⚠ Omitted entirely when unknown. Sending an empty string would be a DIFFERENT
            // question — the server treats an absent postcode as "we have not been told" and a
            // present one as "we checked".
            if (postcode != null) parameter("postcode", postcode)
        }.ensureSuccess().body<List<SavedItemDTO>>().map { it.toDomain() }
    }

    override suspend fun save(productId: String, restoreSavedAt: String?) {
        request {
            core.put("v1/saved/$productId") {
                if (restoreSavedAt != null) {
                    contentType(ContentType.Application.Json)
                    setBody(SaveBody(restoreSavedAt))
                }
            }.ensureSuccess()
        }
    }

    override suspend fun remove(productId: String) {
        request { core.delete("v1/saved/$productId").ensureSuccess() }
    }

    override suspend fun merge(items: List<SavedGuestEntry>): SavedMergeOutcome = request {
        val dto = core.post("v1/saved/merge") {
            contentType(ContentType.Application.Json)
            setBody(
                SavedMergeRequest(
                    items.map {
                        SavedMergeItem(
                            productID = it.productId,
                            // ⚠ Passed through as-is, INCLUDING null. An absent price means the device
                            // never saw one, and the platform then uses the product's current price as
                            // the baseline rather than claiming the item fell from nothing.
                            savedPriceAmount = it.savedPriceAmount,
                            savedCurrency = it.savedCurrency,
                            savedAt = it.savedAt,
                        )
                    },
                ),
            )
        }.ensureSuccess().body<SavedMergeResultDTO>()

        SavedMergeOutcome(
            added = dto.added.toInt(),
            productIds = dto.productIDS.toSet(),
            skipped = dto.skipped.map { SavedMergeSkip(it.productID, it.reason) },
        )
    }

    override suspend fun addAllToCart(postcode: String?, changeId: String): SavedAddToCartOutcome = request {
        val dto = core.post("v1/saved/add-to-cart") {
            contentType(ContentType.Application.Json)
            setBody(AddToCartBody(postcode, changeId))
        }.ensureSuccess().body<SavedAddToCartResultDTO>()

        SavedAddToCartOutcome(
            added = dto.added,
            skipped = dto.skipped.map { SavedMergeSkip(it.productID, it.reason) },
        )
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

/** Undo's restore body. Absent for an ordinary save, which takes now() and lands at the top. */
@Serializable
private data class SaveBody(val restoreSavedAt: String)

@Serializable
private data class AddToCartBody(val postcode: String?, val changeId: String)

// ── Wire → domain ───────────────────────────────────────────────────────────────────────────────

private fun SavedItemDTO.toDomain(): SavedItem = SavedItem(
    productId = id,
    name = name,
    // ⚠ brand / compareAtAmount / badges are carried through, not dropped. The predecessor's mapper
    // discarded all three and then passed brand = null, badges = emptyList() into the product card —
    // so a sale on a saved item was invisible here while visible on every other screen.
    brand = brand,
    imageUrl = imageURL,
    priceAmount = priceAmount,
    currency = currency,
    compareAtAmount = compareAtAmount,
    badges = badges.map { it.value },
    savedAt = savedAt,
    savedPriceAmount = savedPriceAmount,
    // Absent on the wire means "no drop" (FR-044 — there is deliberately no priceRose).
    priceDropped = priceDropped ?: false,
    verdict = verdict.toDomain(),
    categoryKey = categoryKey,
)

/**
 * ⚠ An exhaustive `when` over the generated enum, with no `else`. If the contract ever gains a sixth
 * verdict, this stops COMPILING — which is the point. A default arm would silently map an unknown
 * outcome onto one of the five and tell the shopper the wrong thing about whether they can buy.
 */
private fun WireVerdict.toDomain(): SavedVerdict = when (this) {
    WireVerdict.Purchasable -> SavedVerdict.PURCHASABLE
    WireVerdict.TemporarilyUnavailable -> SavedVerdict.TEMPORARILY_UNAVAILABLE
    WireVerdict.NotDeliveredToYourArea -> SavedVerdict.NOT_DELIVERED_TO_YOUR_AREA
    WireVerdict.NoLongerSold -> SavedVerdict.NO_LONGER_SOLD
    WireVerdict.NotYetDetermined -> SavedVerdict.NOT_YET_DETERMINED
}
