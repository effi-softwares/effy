package com.effyshopping.customer.mobile.features.catalog.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.features.catalog.domain.GetProductDetail
import com.effyshopping.customer.mobile.features.catalog.domain.ProductDetail
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartLine
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartStore
import com.effyshopping.customer.mobile.features.favorites.domain.RemoveFavorite
import com.effyshopping.customer.mobile.features.favorites.domain.SaveFavorite
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
 * The product detail ViewModel (019 US2). Loads the product, adds it to the device-local guest cart,
 * and toggles the favorite. Favorite calls assume a signed-in customer — the View gates a guest through
 * deferred sign-in before calling [toggleFavorite].
 */
class ProductDetailViewModel(
    private val productId: String,
    private val getProductDetail: GetProductDetail,
    private val guestCart: GuestCartStore,
    private val saveFavorite: SaveFavorite,
    private val removeFavorite: RemoveFavorite,
) : ViewModel() {

    private val _state = MutableStateFlow<ProductDetailUiState>(ProductDetailUiState.Loading)
    val state: StateFlow<ProductDetailUiState> = _state.asStateFlow()

    private val _favoriteSaved = MutableStateFlow(false)
    val favoriteSaved: StateFlow<Boolean> = _favoriteSaved.asStateFlow()

    private val _justAdded = MutableStateFlow(false)
    val justAdded: StateFlow<Boolean> = _justAdded.asStateFlow()

    init {
        load()
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
        guestCart.add(
            GuestCartLine(
                productId = product.card.id,
                name = product.card.name,
                imageUrl = product.card.imageUrl,
                unitPriceAmount = product.card.priceAmount,
                currency = product.card.currency,
                quantity = quantity,
            ),
        )
        viewModelScope.launch {
            _justAdded.value = true
            delay(2000)
            _justAdded.value = false
        }
    }

    /** Toggle the favorite. Caller guarantees a signed-in session. Optimistic with revert on failure. */
    fun toggleFavorite() {
        val target = !_favoriteSaved.value
        _favoriteSaved.value = target
        viewModelScope.launch {
            try {
                if (target) saveFavorite(productId) else removeFavorite(productId)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _favoriteSaved.value = !target // revert
            }
        }
    }
}
