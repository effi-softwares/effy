package com.effyshopping.customer.mobile.features.catalog.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.features.catalog.domain.GetProductDetail
import com.effyshopping.customer.mobile.features.catalog.domain.ProductDetail
import com.effyshopping.customer.mobile.features.catalog.domain.Variant
import com.effyshopping.customer.mobile.features.catalog.domain.VariantSelection
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
    /** [selectedVariantId] is the one size price, availability and add follow. */
    data class Ready(val product: ProductDetail, val selectedVariantId: String = product.defaultVariantId) : ProductDetailUiState {
        val selected: Variant? get() = product.variants.firstOrNull { it.id == selectedVariantId } ?: product.variants.firstOrNull()
    }
    data object Error : ProductDetailUiState
}

/**
 * The product detail ViewModel. Loads the product and adds it to the device-local guest
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
     * Reload without clearing the screen — what a pull-to-refresh needs. [load] replaces the content with
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

    /** The shopper picked value [valueId] of the option at [slot]; the selection moves to one size. */
    fun pickValue(slot: Int, valueId: String) {
        val ready = _state.value as? ProductDetailUiState.Ready ?: return
        val current = ready.selected ?: return
        val next = VariantSelection.pickValue(ready.product.variants, current.optionValueIds, slot, valueId) ?: return
        _state.value = ready.copy(selectedVariantId = next.id)
    }

    fun addToCart(quantity: Int) {
        val ready = _state.value as? ProductDetailUiState.Ready ?: return
        val product = ready.product
        val variant = ready.selected ?: return
        if (!variant.available) return
        addToCart(
            GuestCartLine(
                variantId = variant.id,
                productId = product.card.id,
                name = product.card.name,
                variantLabel = variant.label,
                unitPrice = variant.unitPrice,
                imageUrl = variant.imageUrl ?: product.card.imageUrl,
                unitPriceAmount = variant.priceAmount,
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
