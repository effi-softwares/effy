package com.effyshopping.shop.mobile.features.catalog.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.mobile.kit.ui.WindowWidth
import com.effyshopping.mobile.kit.ui.widthClassFor
import com.effyshopping.shop.mobile.app.AppContainer
import com.effyshopping.shop.mobile.core.error.AppError
import com.effyshopping.shop.mobile.core.error.AppException
import com.effyshopping.shop.mobile.features.catalog.domain.ListProducts
import com.effyshopping.shop.mobile.features.catalog.domain.ProductListItem
import com.effyshopping.shop.mobile.features.catalog.domain.ProductQuery
import com.effyshopping.shop.mobile.features.catalog.domain.ProductStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The catalog list (016 US3). Every filter is sent to the backend, which computes the page (FR-017) — the
 * client never holds the whole catalog. State is immutable [UiState]; the View calls the ViewModel's
 * functions for the search box and status filter, and re-queries. Selection ([UiState.selectedId]) drives
 * the tablet two-pane; on a phone the screen raises `onOpenProduct` and the shell pushes a detail route.
 */
class CatalogListViewModel(private val listProducts: ListProducts) : ViewModel() {
    data class UiState(
        val loading: Boolean = true,
        val items: List<ProductListItem> = emptyList(),
        val total: Int = 0,
        val q: String = "",
        val statusFilter: ProductStatus? = null,
        val selectedId: String? = null,
        val error: String? = null,
    )

    private val _state = MutableStateFlow(UiState())
    val state = _state.asStateFlow()

    init { reload() }

    fun onQueryChange(q: String) {
        _state.value = _state.value.copy(q = q)
        reload()
    }

    fun setStatusFilter(status: ProductStatus?) {
        _state.value = _state.value.copy(statusFilter = if (_state.value.statusFilter == status) null else status)
        reload()
    }

    fun select(id: String?) { _state.value = _state.value.copy(selectedId = id) }

    fun reload() {
        val s = _state.value
        _state.value = s.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                val page = listProducts(ProductQuery(q = s.q.ifBlank { null }, status = s.statusFilter))
                _state.value = _state.value.copy(
                    loading = false,
                    items = page.items,
                    total = page.total,
                    // Keep a valid selection on tablet; drop it if the row vanished after a filter.
                    selectedId = _state.value.selectedId?.takeIf { id -> page.items.any { it.id == id } },
                )
            } catch (e: AppException) {
                _state.value = _state.value.copy(loading = false, error = messageFor(e.error))
            }
        }
    }

    private fun messageFor(e: AppError): String = when (e) {
        AppError.Network -> "No connection. Check your network and try again."
        AppError.Forbidden -> "You don't have access to the catalog."
        else -> "We couldn't load the catalog. Try again shortly."
    }
}

/**
 * The Catalog tab root. Adaptive (016 R13, tablet-first): a single scrolling list on compact/medium windows
 * (tap → the shell pushes a detail route), a **two-pane** list + detail on an EXPANDED window (tablet
 * landscape — the primary shop device). "New product" opens the schema-driven create bottom sheet. No cards
 * (rows + dividers, DOCTRINE-2).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CatalogListScreen(container: AppContainer, onOpenProduct: (String) -> Unit) {
    val vm = viewModel { CatalogListViewModel(container.listProducts) }
    val state by vm.state.collectAsState()
    var showCreate by remember { mutableStateOf(false) }

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val expanded = widthClassFor(maxWidth) == WindowWidth.EXPANDED
        Column(modifier = Modifier.fillMaxSize()) {
            CatalogHeader(state, vm, onNew = { showCreate = true })
            HorizontalDivider()
            if (expanded) {
                Row(modifier = Modifier.fillMaxSize()) {
                    Box(modifier = Modifier.weight(1f).fillMaxSize()) {
                        CatalogList(state, onRowClick = { vm.select(it) })
                    }
                    VerticalDivider()
                    Box(modifier = Modifier.weight(1.4f).fillMaxSize()) {
                        val id = state.selectedId
                        if (id == null) {
                            EmptyPane("Select a product to see its details.")
                        } else {
                            ProductDetailPane(container, id, onDeleted = { vm.select(null); vm.reload() })
                        }
                    }
                }
            } else {
                CatalogList(state, onRowClick = onOpenProduct)
            }
        }
    }

    if (showCreate) {
        val createVm = viewModel { CreateViewModel(container.getCatalogSchema, container.createProduct, container.draftStore) }
        ProductCreateSheet(
            vm = createVm,
            onCreated = { showCreate = false; vm.reload() },
            onDismiss = { showCreate = false },
        )
    }
}

@Composable
private fun CatalogHeader(state: CatalogListViewModel.UiState, vm: CatalogListViewModel, onNew: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("Catalog", style = MaterialTheme.typography.headlineSmall)
            Button(onClick = onNew) { Text("New product") }
        }
        OutlinedTextField(
            value = state.q,
            onValueChange = vm::onQueryChange,
            label = { Text("Search name, SKU or brand") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        StatusFilters(state.statusFilter, vm::setStatusFilter)
        Text("${state.total} product${if (state.total == 1) "" else "s"}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StatusFilters(selected: ProductStatus?, onSelect: (ProductStatus) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        ProductStatus.entries.forEach { status ->
            FilterChip(selected = selected == status, onClick = { onSelect(status) }, label = { Text(status.label) })
        }
    }
}

@Composable
private fun CatalogList(state: CatalogListViewModel.UiState, onRowClick: (String) -> Unit) {
    when {
        state.loading && state.items.isEmpty() -> Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() }
        state.error != null && state.items.isEmpty() -> EmptyPane(state.error)
        state.items.isEmpty() -> EmptyPane("No products yet. Tap \"New product\" to add your first one.")
        else -> LazyColumn(modifier = Modifier.fillMaxSize()) {
            items(state.items, key = { it.id }) { item ->
                ProductRow(item, selected = item.id == state.selectedId, onClick = { onRowClick(item.id) })
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun ProductRow(item: ProductListItem, selected: Boolean, onClick: () -> Unit) {
    val bg = if (selected) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.surface
    Row(
        modifier = Modifier.fillMaxWidth().background(bg).clickable(onClick = onClick).padding(16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(item.name, style = MaterialTheme.typography.bodyLarge)
            Text(
                listOfNotNull(item.brand, item.typeName, item.sku?.let { "SKU $it" }).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("${item.currency} ${item.priceAmount}", style = MaterialTheme.typography.bodyLarge)
            Text(item.status.label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
private fun EmptyPane(message: String) {
    Box(modifier = Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
    }
}
