package com.effyshopping.customer.mobile.features.catalog.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.features.catalog.domain.GetProductDetail
import com.effyshopping.customer.mobile.features.catalog.domain.ProductDetail
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartLine
import com.effyshopping.customer.mobile.features.cart.domain.AddToCart
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface ProductDetailUiState {
    data object Loading : ProductDetailUiState
    data class Ready(val product: ProductDetail) : ProductDetailUiState
    data object Error : ProductDetailUiState
}

/**
 * The product detail ViewModel (019 US2). Loads the product and adds it to the device-local guest
 * cart.
 */
class ProductDetailViewModel(
    private val productId: String,
    private val getProductDetail: GetProductDetail,
    private val addToCart: AddToCart,
) : ViewModel() {

    private val _state = MutableStateFlow<ProductDetailUiState>(ProductDetailUiState.Loading)
    val state: StateFlow<ProductDetailUiState> = _state.asStateFlow()

    private val _justAdded = MutableStateFlow(false)
    val justAdded: StateFlow<Boolean> = _justAdded.asStateFlow()

    init {
        load()
    }

    /**
     * Reload WITHOUT clearing the screen — what a pull-to-refresh needs. [load] replaces the content with
     * a spinner, which is right on first open and wrong when the shopper is looking at this and asking for
     * a newer version of it. A failure keeps what is on screen.
     */
    suspend fun refresh() {
        try {
            _state.value = ProductDetailUiState.Ready(getProductDetail(productId))
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            // Keep what is on screen.
        }
    }

    fun load() {
        viewModelScope.launch {
            _state.value = ProductDetailUiState.Loading
            try {
                _state.value = ProductDetailUiState.Ready(getProductDetail(productId))
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _state.value = ProductDetailUiState.Error
            }
        }
    }

    fun addToCart(quantity: Int) {
        val product = (_state.value as? ProductDetailUiState.Ready)?.product ?: return
        if (!product.card.available) return
        addToCart(
            GuestCartLine(
                productId = product.card.id,
                name = product.card.name,
                imageUrl = product.card.imageUrl,
                unitPriceAmount = product.card.priceAmount,
                currency = product.card.currency,
                quantity = quantity,
                packageKey = product.card.packageKey,
            ),
        )
        viewModelScope.launch {
            _justAdded.value = true
            delay(2000)
            _justAdded.value = false
        }
    }
}
