package com.effyshopping.customer.mobile.features.favorites.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.ui.Modifier
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.presentation.EffyProductCard
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyEmptyState
import com.effyshopping.customer.mobile.core.presentation.EffyProductCardSkeleton
import com.effyshopping.customer.mobile.core.presentation.ProductGridGutter
import com.effyshopping.customer.mobile.core.presentation.ProductGridPadding
import com.effyshopping.customer.mobile.core.presentation.ProductGridRowGap
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartLine
import com.effyshopping.customer.mobile.features.catalog.domain.ProductCard
import com.effyshopping.customer.mobile.features.favorites.domain.FavoriteCard
import com.effyshopping.customer.mobile.features.favorites.domain.ListFavorites
import com.effyshopping.customer.mobile.features.favorites.domain.RemoveFavorite
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_arrow_back
import com.effyshopping.customer.mobile.resources.ic_favorite_outlined
import com.effyshopping.mobile.kit.ui.EffyTopBar
import org.jetbrains.compose.resources.painterResource
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private sealed interface FavoritesUiState {
    data object Loading : FavoritesUiState
    data class Ready(val items: List<FavoriteCard>) : FavoritesUiState
    data object Error : FavoritesUiState
}

private class FavoritesViewModel(
    private val listFavorites: ListFavorites,
    private val removeFavorite: RemoveFavorite,
) : ViewModel() {
    private val _state = MutableStateFlow<FavoritesUiState>(FavoritesUiState.Loading)
    val state: StateFlow<FavoritesUiState> = _state.asStateFlow()

    init {
        load()
    }

    /** Public since 026: the error state offers a retry (FR-021 — every error state offers a way out). */
    fun load() {
        viewModelScope.launch {
            try {
                _state.value = FavoritesUiState.Ready(listFavorites())
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _state.value = FavoritesUiState.Error
            }
        }
    }

    fun remove(id: String) {
        val current = (_state.value as? FavoritesUiState.Ready) ?: return
        _state.value = FavoritesUiState.Ready(current.items.filterNot { it.id == id })
        viewModelScope.launch { runCatching { removeFavorite(id) } }
    }
}

/**
 * Favourites (019 US6, restyled by 025).
 *
 * ⚠ This was a TEXT LIST — name, price, and three text buttons, with no image at all — on a screen
 * whose entire purpose is "the things I liked the look of". The web `/favorites` renders the same
 * product grid as the rest of the storefront, so this now does too: the shared [EffyProductCard],
 * the shared grid rhythm, and the per-item actions beneath each tile.
 */
@Composable
fun FavoritesScreen(
    container: AppContainer,
    onOpen: (String) -> Unit,
    /** ⚠ Required: this is a PUSHED screen, and FR-030 gives every pushed screen a standard back. */
    onBack: () -> Unit,
    /** FR-044: the empty state must offer a route back into the catalogue, not a dead end. */
    onBrowse: () -> Unit = onBack,
) {
    val vm = viewModel { FavoritesViewModel(container.listFavorites, container.removeFavorite) }
    val state by vm.state.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = "Saved Items", onBack = onBack)

        when (val s = state) {
            FavoritesUiState.Loading -> LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                horizontalArrangement = Arrangement.spacedBy(ProductGridGutter),
                verticalArrangement = Arrangement.spacedBy(ProductGridRowGap),
                contentPadding = ProductGridPadding,
                modifier = Modifier.fillMaxSize(),
                userScrollEnabled = false,
            ) {
                items(List(4) { it }) { EffyProductCardSkeleton() }
            }

            FavoritesUiState.Error -> EffyEmptyState(
                title = "We couldn’t load your saved items",
                body = "Please try again in a moment.",
                icon = Res.drawable.ic_favorite_outlined,
                actionLabel = "Try again",
                onAction = vm::load,
            )

            is FavoritesUiState.Ready ->
                if (s.items.isEmpty()) {
                    // FR-044: an empty favourites list offers a route back into the catalogue.
                    EffyEmptyState(
                        title = "No Saved Items!",
                        body = "You don’t have any saved items yet. Tap the heart on a product and it will be waiting for you here.",
                        icon = Res.drawable.ic_favorite_outlined,
                        actionLabel = "Start shopping",
                        onAction = onBrowse,
                    )
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        horizontalArrangement = Arrangement.spacedBy(ProductGridGutter),
                        verticalArrangement = Arrangement.spacedBy(ProductGridRowGap),
                        contentPadding = ProductGridPadding,
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        items(s.items, key = { it.id }) { fav ->
                            FavoriteTile(
                                fav = fav,
                                onOpen = onOpen,
                                onAdd = { container.addToCart(it) },
                                onRemove = { vm.remove(fav.id) },
                            )
                        }
                    }
                }
        }
    }
}

/**
 * A saved product: the storefront card, plus the two actions this screen exists for.
 *
 * ⚠ The card is rendered from a [ProductCard] built out of the [FavoriteCard], rather than by
 * writing a fourth product tile. The favourites projection carries fewer fields than the catalogue
 * one — no brand, no compare-at, no badges — so those are absent rather than invented, and the card
 * degrades to exactly what the data supports.
 */
@Composable
private fun FavoriteTile(
    fav: FavoriteCard,
    onOpen: (String) -> Unit,
    onAdd: (GuestCartLine) -> Unit,
    onRemove: () -> Unit,
) {
    Column {
        EffyProductCard(
            product = ProductCard(
                id = fav.id,
                name = fav.name,
                brand = null,
                imageUrl = fav.imageUrl,
                priceAmount = fav.priceAmount,
                currency = fav.currency,
                compareAtAmount = null,
                badges = emptyList(),
                available = fav.available,
            ),
            onClick = onOpen,
        )

        Row(
            modifier = Modifier.padding(top = EffySpacing.s),
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.xs),
        ) {
            TextButton(
                onClick = {
                    onAdd(GuestCartLine(fav.id, fav.name, fav.imageUrl, fav.priceAmount, fav.currency, 1))
                },
                enabled = fav.available,
                contentPadding = PaddingValues(horizontal = EffySpacing.s),
            ) { Text(if (fav.available) "Add" else "Unavailable") }

            TextButton(
                onClick = onRemove,
                contentPadding = PaddingValues(horizontal = EffySpacing.s),
            ) { Text("Remove") }
        }
    }
}
