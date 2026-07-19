package com.effyshopping.customer.mobile.features.favorites.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartLine
import com.effyshopping.customer.mobile.features.favorites.domain.FavoriteCard
import com.effyshopping.customer.mobile.features.favorites.domain.ListFavorites
import com.effyshopping.customer.mobile.features.favorites.domain.RemoveFavorite
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

    private fun load() {
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

/** Favourites list (019 US6). Open/add-to-cart/remove. Signed-in only. */
@Composable
fun FavoritesScreen(container: AppContainer, onOpen: (String) -> Unit) {
    val vm = viewModel { FavoritesViewModel(container.listFavorites, container.removeFavorite) }
    val state by vm.state.collectAsState()

    when (val s = state) {
        FavoritesUiState.Loading ->
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) { CircularProgressIndicator(Modifier.padding(32.dp)) }

        FavoritesUiState.Error ->
            Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("We couldn’t load your favourites", style = MaterialTheme.typography.bodyMedium)
            }

        is FavoritesUiState.Ready ->
            if (s.items.isEmpty()) {
                Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("You haven’t saved anything yet.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else {
                LazyColumn(Modifier.fillMaxSize()) {
                    items(s.items, key = { it.id }) { fav ->
                        FavoriteRow(fav, onOpen = onOpen, onAdd = { container.guestCart.add(it) }, onRemove = { vm.remove(fav.id) })
                        HorizontalDivider()
                    }
                }
            }
    }
}

@Composable
private fun FavoriteRow(
    fav: FavoriteCard,
    onOpen: (String) -> Unit,
    onAdd: (GuestCartLine) -> Unit,
    onRemove: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(fav.name, style = MaterialTheme.typography.bodyMedium)
        Text(money(fav.priceAmount, fav.currency), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = { onOpen(fav.id) }) { Text("Open") }
            TextButton(
                onClick = {
                    onAdd(GuestCartLine(fav.id, fav.name, fav.imageUrl, fav.priceAmount, fav.currency, 1))
                },
                enabled = fav.available,
            ) { Text(if (fav.available) "Add to cart" else "Unavailable") }
            TextButton(onClick = onRemove) { Text("Remove") }
        }
    }
}

private fun money(amount: String, currency: String): String =
    if (currency == "AUD") "$$amount" else "$currency $amount"
