package com.effyshopping.shop.mobile.features.catalog.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.shop.mobile.features.catalog.domain.GetProduct
import com.effyshopping.shop.mobile.features.catalog.domain.ListProducts
import com.effyshopping.shop.mobile.features.catalog.domain.ProductDetail
import com.effyshopping.shop.mobile.features.catalog.domain.ProductListItem
import com.effyshopping.shop.mobile.features.catalog.domain.ProductPage
import com.effyshopping.shop.mobile.features.catalog.domain.ProductQuery
import com.effyshopping.shop.mobile.features.catalog.domain.ProductStatus
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

data class CatalogUiState(
    val filter: CatalogFilter = CatalogFilter.ALL,
    val page: ProductPage? = null,
    val selectedId: String? = null,
    val detail: ProductDetail? = null,
    val isLoadingList: Boolean = true,
    val isLoadingDetail: Boolean = false,
    val message: String? = null,
) {
    val products: List<ProductListItem> get() = page?.items.orEmpty()
    val total: Int get() = page?.total ?: 0
}

class CatalogViewModel(
    private val listProducts: ListProducts,
    private val getProduct: GetProduct,
    private val coroutineScope: CoroutineScope? = null,
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
            mutableState.update { it.copy(selectedId = id, isLoadingDetail = true, message = null) }
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
}
