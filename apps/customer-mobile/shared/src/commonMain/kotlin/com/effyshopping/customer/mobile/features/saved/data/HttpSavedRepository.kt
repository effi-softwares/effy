package com.effyshopping.customer.mobile.features.saved.data

import com.effyshopping.customer.mobile.commerce.contract.SavedItemDTO
import com.effyshopping.customer.mobile.commerce.contract.SavedListCreateRequest
import com.effyshopping.customer.mobile.commerce.contract.SavedListDTO
import com.effyshopping.customer.mobile.commerce.contract.SavedListEntryRequest
import com.effyshopping.customer.mobile.commerce.contract.SavedListRefusal
import com.effyshopping.customer.mobile.commerce.contract.SavedListRenameRequest
import com.effyshopping.customer.mobile.contract.ProblemJSON
import com.effyshopping.customer.mobile.commerce.contract.SavedMembershipDTO
import com.effyshopping.customer.mobile.commerce.contract.SavedMergeItem
import com.effyshopping.customer.mobile.commerce.contract.SavedMergeRequest
import com.effyshopping.customer.mobile.commerce.contract.SavedAddToCartRequest
import com.effyshopping.customer.mobile.commerce.contract.SavedAddToCartResultDTO
import com.effyshopping.customer.mobile.commerce.contract.SavedMergeResultDTO
import com.effyshopping.customer.mobile.commerce.contract.SavedVerdict as WireVerdict
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.http.effyJson
import com.effyshopping.customer.mobile.core.http.ensureSuccess
import com.effyshopping.customer.mobile.core.http.toAppException
import com.effyshopping.customer.mobile.features.saved.domain.DEFAULT_LIST_ID
import com.effyshopping.customer.mobile.features.saved.domain.ListRefusal
import com.effyshopping.customer.mobile.features.saved.domain.ListRefusedException
import com.effyshopping.customer.mobile.features.saved.domain.ListRepository
import com.effyshopping.customer.mobile.features.saved.domain.SavedList
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
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.contentType
import io.ktor.http.isSuccess
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
class HttpSavedRepository(private val core: HttpClient) :
    SavedRepository, SavedMergeRepository, SavedCartRepository, ListRepository {

    override suspend fun membership(): SavedMembership = request {
        val dto = core.get("v1/saved/ids").ensureSuccess().body<SavedMembershipDTO>()
        SavedMembership(
            productIds = dto.productIDS.toSet(),
            // Absent from a backend older than 068; empty is the safe reading (the platform refuses
            // a destructive un-save whatever the app believes).
            namedProductIds = dto.namedProductIDS.orEmpty().toSet(),
        )
    }

    /**
     * ⚠ "Saved" still reads `v1/saved`, not `v1/lists/default/items`. They are the same list, and the
     * older route also answers on a backend from before 068 — so a stale backend costs a shopper
     * their named lists, never their saved items.
     */
    override suspend fun list(listId: String): List<SavedItem> = request {
        val path = if (listId == DEFAULT_LIST_ID) "v1/saved" else "v1/lists/$listId/items"
        core.get(path).ensureListSuccess().body<List<SavedItemDTO>>().map { it.toDomain() }
    }

    override suspend fun save(productId: String, restoreSavedAt: String?) {
        request {
            core.put("v1/saved/$productId") {
                if (restoreSavedAt != null) {
                    contentType(ContentType.Application.Json)
                    setBody(SaveBody(restoreSavedAt))
                }
            }.ensureListSuccess()
        }
    }

    override suspend fun remove(productId: String) {
        request { core.delete("v1/saved/$productId").ensureListSuccess() }
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

    override suspend fun addAllToCart(listId: String, changeId: String): SavedAddToCartOutcome = request {
        val path = if (listId == DEFAULT_LIST_ID) "v1/saved/add-to-cart" else "v1/lists/$listId/add-to-cart"
        val dto = core.post(path) {
            contentType(ContentType.Application.Json)
            setBody(AddToCartBody(changeId))
        }.ensureListSuccess().body<SavedAddToCartResultDTO>()

        SavedAddToCartOutcome(
            added = dto.added,
            skipped = dto.skipped.map { SavedMergeSkip(it.productID, it.reason) },
        )
    }

    /* ── 068: lists ──────────────────────────────────────────────────────────────────────────── */

    override suspend fun lists(productId: String?): List<SavedList> = request {
        core.get("v1/lists") { if (productId != null) parameter("productId", productId) }
            .ensureListSuccess().body<List<SavedListDTO>>().map { it.toDomain() }
    }

    override suspend fun create(name: String, productId: String?): SavedList = request {
        core.post("v1/lists") {
            contentType(ContentType.Application.Json)
            setBody(SavedListCreateRequest(name = name, productID = productId))
        }.ensureListSuccess().body<SavedListDTO>().toDomain()
    }

    override suspend fun rename(listId: String, name: String): SavedList = request {
        core.patch("v1/lists/$listId") {
            contentType(ContentType.Application.Json)
            setBody(SavedListRenameRequest(name))
        }.ensureListSuccess().body<SavedListDTO>().toDomain()
    }

    override suspend fun delete(listId: String) {
        request { core.delete("v1/lists/$listId").ensureListSuccess() }
    }

    override suspend fun addEntry(listId: String, productId: String, restoreAddedAt: String?) {
        request {
            core.put("v1/lists/$listId/entries/$productId") {
                if (restoreAddedAt != null) {
                    contentType(ContentType.Application.Json)
                    setBody(SavedListEntryRequest(restoreAddedAt))
                }
            }.ensureListSuccess()
        }
    }

    override suspend fun removeEntry(listId: String, productId: String) {
        request { core.delete("v1/lists/$listId/entries/$productId").ensureListSuccess() }
    }

    private suspend inline fun <T> request(block: () -> T): T =
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: ListRefusedException) {
            // ⚠ BEFORE the catch-all below, or every refusal the shopper can act on ("that name is
            // taken") is flattened into "something went wrong".
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
private data class AddToCartBody(val changeId: String)

/**
 * Like `ensureSuccess`, but a refusal the platform NAMED is thrown as a [ListRefusedException].
 *
 * ⚠ The reason is the last segment of the problem's `type` (`…/problems/name-taken`). The status
 * alone cannot carry it: a bad name and a full set of lists are both 400, and
 * `HttpResponse.toAppException` maps EVERY 409 on the platform to "wrong password mode".
 */
private suspend fun HttpResponse.ensureListSuccess(): HttpResponse {
    if (status.isSuccess()) return this
    val type = runCatching { effyJson.decodeFromString(ProblemJSON.serializer(), bodyAsText()).type }.getOrNull()
    listRefusal(type)?.let { throw ListRefusedException(it) }
    throw toAppException()
}

/** Exposed for its test: the mapping is the contract between this app and the platform. */
internal fun listRefusal(problemType: String?): ListRefusal? {
    val reason = problemType?.substringAfterLast('/')?.replace('-', '_') ?: return null
    return when (SavedListRefusal.entries.firstOrNull { it.value == reason }) {
        SavedListRefusal.NameTaken -> ListRefusal.NAME_TAKEN
        SavedListRefusal.InvalidName -> ListRefusal.INVALID_NAME
        SavedListRefusal.ListLimit -> ListRefusal.LIST_LIMIT
        SavedListRefusal.DefaultList -> ListRefusal.DEFAULT_LIST
        SavedListRefusal.ListNotFound -> ListRefusal.LIST_NOT_FOUND
        SavedListRefusal.InNamedLists -> ListRefusal.IN_NAMED_LISTS
        SavedListRefusal.SavedItemsCapReached -> ListRefusal.CAP_REACHED
        null -> null
    }
}

private fun SavedListDTO.toDomain(): SavedList = SavedList(
    id = id,
    isDefault = isDefault,
    name = name,
    count = count.toInt(),
    onlyHereCount = onlyHereCount.toInt(),
    containsProduct = containsProduct,
)

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
    WireVerdict.NoLongerSold -> SavedVerdict.NO_LONGER_SOLD
}
