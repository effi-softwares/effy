package com.effyshopping.shop.mobile.features.catalog.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.shop.mobile.features.catalog.domain.GetProduct
import com.effyshopping.shop.mobile.features.catalog.domain.ListProducts
import com.effyshopping.shop.mobile.features.catalog.domain.ProductDetail
import com.effyshopping.shop.mobile.features.catalog.domain.ProductListItem
import com.effyshopping.shop.mobile.features.catalog.domain.ProductPage
import com.effyshopping.shop.mobile.features.catalog.domain.ProductQuery
import com.effyshopping.shop.mobile.core.error.AppError
import com.effyshopping.shop.mobile.core.error.AppException
import com.effyshopping.shop.mobile.features.catalog.domain.ProductStatus
import com.effyshopping.shop.mobile.features.catalog.domain.ReviewState
import com.effyshopping.shop.mobile.features.catalog.domain.SubmitProductForReview
import com.effyshopping.shop.mobile.features.catalog.domain.WithdrawProductReview
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class CatalogFilter(val label: String, val status: ProductStatus?) {
    ALL("All", null),
    ACTIVE("Active", ProductStatus.ACTIVE),
    DRAFT("Draft", ProductStatus.DRAFT),
    UNAVAILABLE("Unavailable", ProductStatus.UNAVAILABLE),
    ARCHIVED("Archived", ProductStatus.ARCHIVED),
}

/**
 * What the product's one review button does (067), or null when there is none.
 *
 * ⚠ THERE IS NO "PUBLISH". A product Effy never approved reaches the storefront by being submitted
 * and approved; the server refuses anything else, so a button offering it would be a control that
 * cannot do what it says.
 */
enum class ReviewAction(val label: String, val doneMessage: String) {
    SUBMIT("Submit for review", "Sent to Effy for review. It goes on sale once it is approved."),
    RESUBMIT("Submit again", "Sent to Effy for review. It goes on sale once it is approved."),
    WITHDRAW("Withdraw", "Withdrawn. It is a draft again, and nothing you entered was lost."),
    DISCARD_CHANGE("Discard change", "Change discarded. The product on sale was never altered."),
}

fun reviewActionFor(detail: ProductDetail): ReviewAction? = when (detail.reviewState) {
    ReviewState.DRAFT -> ReviewAction.SUBMIT
    ReviewState.SENT_BACK -> ReviewAction.RESUBMIT
    ReviewState.IN_REVIEW -> ReviewAction.WITHDRAW
    ReviewState.LIVE_CHANGE_PENDING, ReviewState.LIVE_CHANGE_SENT_BACK -> ReviewAction.DISCARD_CHANGE
    ReviewState.LIVE -> null
}

data class CatalogUiState(
    val filter: CatalogFilter = CatalogFilter.ALL,
    val page: ProductPage? = null,
    val selectedId: String? = null,
    val detail: ProductDetail? = null,
    val isLoadingList: Boolean = true,
    val isLoadingDetail: Boolean = false,
    val message: String? = null,
    /** A review request is in flight — the button is disabled so a second tap cannot double-send. */
    val isActing: Boolean = false,
    /** The outcome of the last review request, said in words under the product's title. */
    val reviewMessage: String? = null,
) {
    val products: List<ProductListItem> get() = page?.items.orEmpty()
    val total: Int get() = page?.total ?: 0
}

class CatalogViewModel(
    private val listProducts: ListProducts,
    private val getProduct: GetProduct,
    private val coroutineScope: CoroutineScope? = null,
    private val submitForReview: SubmitProductForReview? = null,
    private val withdrawReview: WithdrawProductReview? = null,
) : ViewModel() {
    private val mutableState = MutableStateFlow(CatalogUiState())
    val state = mutableState.asStateFlow()
    private val scope: CoroutineScope get() = coroutineScope ?: viewModelScope

    init {
        refresh()
    }

    fun refresh() {
        val filter = mutableState.value.filter
        scope.launch {
            mutableState.update { it.copy(isLoadingList = true, message = null) }
            runCatching {
                listProducts(ProductQuery(status = filter.status, page = 1, pageSize = 25))
            }.fold(
                onSuccess = { page ->
                    val selectedId = page.items.firstOrNull { it.id == mutableState.value.selectedId }?.id
                        ?: page.items.firstOrNull()?.id
                    mutableState.update {
                        it.copy(
                            page = page,
                            selectedId = selectedId,
                            detail = null,
                            isLoadingList = false,
                            message = null,
                        )
                    }
                    selectedId?.let(::selectProduct)
                },
                onFailure = {
                    mutableState.update {
                        it.copy(
                            isLoadingList = false,
                            isLoadingDetail = false,
                            message = "Catalog could not be loaded. Try again.",
                        )
                    }
                },
            )
        }
    }

    fun selectFilter(filter: CatalogFilter) {
        if (filter == mutableState.value.filter) return
        mutableState.update { it.copy(filter = filter, selectedId = null, detail = null) }
        refresh()
    }

    fun selectProduct(id: String) {
        if (id == mutableState.value.selectedId && mutableState.value.detail?.id == id) return
        scope.launch {
            mutableState.update { it.copy(selectedId = id, isLoadingDetail = true, message = null, reviewMessage = null) }
            runCatching { getProduct(id) }.fold(
                onSuccess = { detail ->
                    mutableState.update { it.copy(detail = detail, selectedId = detail.id, isLoadingDetail = false) }
                },
                onFailure = {
                    mutableState.update {
                        it.copy(isLoadingDetail = false, message = "Product details could not be loaded.")
                    }
                },
            )
        }
    }

    /** Run the product's review action (067): submit, resubmit, withdraw, or discard a pending change. */
    fun runReviewAction() {
        val detail = mutableState.value.detail ?: return
        val action = reviewActionFor(detail) ?: return
        if (mutableState.value.isActing) return
        val call = when (action) {
            ReviewAction.SUBMIT, ReviewAction.RESUBMIT -> submitForReview?.let { s -> suspend { s(detail.id) } }
            ReviewAction.WITHDRAW, ReviewAction.DISCARD_CHANGE -> withdrawReview?.let { w -> suspend { w(detail.id) } }
        } ?: return
        scope.launch {
            mutableState.update { it.copy(isActing = true, reviewMessage = null) }
            runCatching { call() }.fold(
                onSuccess = { updated ->
                    mutableState.update { s ->
                        s.copy(
                            detail = updated,
                            isActing = false,
                            reviewMessage = action.doneMessage,
                            // The list row carries the review pill too — keep the two in step
                            // without a second request.
                            page = s.page?.copy(
                                items = s.page.items.map {
                                    if (it.id == updated.id) it.copy(reviewState = updated.reviewState) else it
                                },
                            ),
                        )
                    }
                },
                onFailure = { e ->
                    mutableState.update { it.copy(isActing = false, reviewMessage = reviewFailure(action, e)) }
                },
            )
        }
    }
}

/**
 * ⚠ OUR OWN WORDS, keyed on the error's KIND. A refused submit means details are missing, and the
 * shop needs to be told that is fixable — not shown a server sentence, and not "something went wrong".
 */
internal fun reviewFailure(action: ReviewAction, e: Throwable): String {
    val submitting = action == ReviewAction.SUBMIT || action == ReviewAction.RESUBMIT
    return when ((e as? AppException)?.error) {
        is AppError.Validation ->
            "This product is missing a required detail or its main image. Finish it in the shop console, then submit it."
        AppError.Conflict ->
            if (submitting) "Effy has already reviewed this product. Pull to refresh to see where it stands."
            else "There is nothing waiting for review on this product. Pull to refresh to see where it stands."
        AppError.Network -> "No connection. Nothing was sent — try again."
        else -> if (submitting) "It could not be submitted. Try again." else "It could not be withdrawn. Try again."
    }
}
