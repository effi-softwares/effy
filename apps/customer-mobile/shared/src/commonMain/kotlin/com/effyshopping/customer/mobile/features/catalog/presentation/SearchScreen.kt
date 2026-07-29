package com.effyshopping.customer.mobile.features.catalog.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyEmptyState
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_search_outlined
import com.effyshopping.customer.mobile.core.presentation.EffyButtonShape
import com.effyshopping.customer.mobile.core.presentation.EffyProductCard
import com.effyshopping.customer.mobile.core.presentation.EffyProductCardSkeleton
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.customer.mobile.core.presentation.ProductGridGutter
import com.effyshopping.customer.mobile.core.presentation.ProductGridPadding
import com.effyshopping.customer.mobile.core.presentation.ProductGridRowGap
import com.effyshopping.customer.mobile.features.cart.presentation.CartAction
import com.effyshopping.customer.mobile.features.catalog.domain.ProductSortOption
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.mobile.kit.ui.EffyPlaceholder
import com.effyshopping.mobile.kit.ui.EffyTopBar

/**
 * Search (019 US4, extended by 025 US1).
 *
 * Query input, refinement chips, a SORT control and a RESULT COUNT; results in a grid with keyset
 * infinite scroll. Only available products (server-enforced).
 *
 * [categoryKey] arrives when the shopper taps a category in Browse — a category is a refined result
 * set, so Browse hands off here rather than growing its own results implementation.
 */
@Composable
fun SearchScreen(
    container: AppContainer,
    categoryKey: String? = null,
    /** Entry refinement — set when Home's on-sale rail hands off via "See all" (web `?saleOnly=true`). */
    saleOnly: Boolean = false,
    onProductClick: (String) -> Unit,
    onCart: () -> Unit = {},
) {
    val vm = viewModel { SearchViewModel(container.searchProducts) }
    val state by vm.state.collectAsState()
    val gridState = rememberLazyGridState()

    // Apply (or clear) the refinements handed over by Browse / Home's "See all".
    LaunchedEffect(categoryKey) { if (state.categoryKey != categoryKey) vm.applyCategory(categoryKey) }
    LaunchedEffect(saleOnly) { if (saleOnly) vm.applySaleOnly(true) }

    val loadMore by remember {
        derivedStateOf {
            val last = gridState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1
            last >= state.items.size - 4 && state.cursor != null && !state.loading
        }
    }
    LaunchedEffect(loadMore) { if (loadMore) vm.loadMore() }

    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = "Search", trailing = { CartAction(container, onCart) })

        Column(modifier = Modifier.padding(horizontal = EffySpacing.md)) {
            // A pill on the tint, matching the web header's search control. `placeholder` rather
            // than `label`: a floating label inside a pill collides with the rounded edge, and the
            // field is unambiguous under a screen titled "Search".
            OutlinedTextField(
                value = state.query,
                onValueChange = vm::onQueryChange,
                placeholder = { Text("Search groceries, brands and more…") },
                singleLine = true,
                shape = EffyButtonShape,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = EffySurface.tint,
                    unfocusedContainerColor = EffySurface.tint,
                    focusedBorderColor = MaterialTheme.colorScheme.outline,
                    unfocusedBorderColor = Color.Transparent,
                ),
                modifier = Modifier.fillMaxWidth().padding(vertical = EffySpacing.s),
            )

            Row(
                horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                FilterChip(
                    selected = state.saleOnly,
                    onClick = vm::toggleSale,
                    label = { Text("On sale") },
                )
                if (state.categoryKey != null) {
                    FilterChip(
                        selected = true,
                        onClick = { vm.applyCategory(null) },
                        label = { Text(state.categoryKey!!) },
                    )
                }
                if (state.saleOnly || state.categoryKey != null) {
                    TextButton(onClick = vm::clearRefinements) { Text("Clear all") }
                }
            }

            // ── Result count + sort (025 FR-016/FR-016a) ────────────────────────────────────────
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = EffySpacing.s),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    when {
                        state.total != null -> "${state.total} ${if (state.total == 1) "result" else "results"}"
                        state.loading -> "Searching…"
                        else -> ""
                    },
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    // Announced, so a screen-reader user learns the set changed size (FR-045).
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
                SortControl(
                    // The ordering the SERVER applied — rendering the requested one would let the
                    // control misdescribe the list beneath it.
                    current = state.sort,
                    queryPresent = state.query.isNotBlank(),
                    onSelect = vm::applySort,
                )
            }
        }

        when {
            state.items.isEmpty() && state.loading -> SearchSkeleton()

            state.failed ->
                EffyEmptyState(
                    title = "We couldn’t load results",
                    body = "Please try again in a moment.",
                    icon = Res.drawable.ic_search_outlined,
                )

            state.items.isEmpty() ->
                EffyEmptyState(
                    title = if (state.query.isBlank()) "Start typing to search" else "No results for “${state.query}”",
                    body = if (state.saleOnly || state.categoryKey != null) {
                        "Your filters may be too narrow — try removing one."
                    } else {
                        "Try a different search, or browse the store by category."
                    },
                )

            else -> LazyVerticalGrid(
                state = gridState,
                columns = GridCells.Fixed(2),
                horizontalArrangement = Arrangement.spacedBy(ProductGridGutter),
                verticalArrangement = Arrangement.spacedBy(ProductGridRowGap),
                contentPadding = ProductGridPadding,
                modifier = Modifier.fillMaxSize(),
            ) {
                items(state.items, key = { it.id }) { product ->
                    // `fillHeight` pins every price row in a row of results to the same baseline —
                    // the tallest name in the row sets the height and the prices stay level.
                    EffyProductCard(
                        product,
                        onProductClick,
                        modifier = Modifier.fillMaxHeight(),
                        fillHeight = true,
                    )
                }
            }
        }
    }
}

/** The ordering control. "Best match" only appears with a query — without one the server falls back. */
@Composable
private fun SortControl(
    current: ProductSortOption,
    queryPresent: Boolean,
    onSelect: (ProductSortOption) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val options = ProductSortOption.entries.filter {
        it != ProductSortOption.RELEVANCE || queryPresent
    }

    Box {
        TextButton(onClick = { expanded = true }) { Text("Sort: ${current.label}") }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option.label) },
                    onClick = {
                        expanded = false
                        onSelect(option)
                    },
                )
            }
        }
    }
}

/** A content-shaped first-load placeholder (FR-032) — the grid that is coming, not a bare spinner. */
@Composable
private fun SearchSkeleton() {
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        horizontalArrangement = Arrangement.spacedBy(ProductGridGutter),
        verticalArrangement = Arrangement.spacedBy(ProductGridRowGap),
        contentPadding = ProductGridPadding,
        modifier = Modifier.fillMaxSize(),
        userScrollEnabled = false,
    ) {
        items(List(6) { it }) { EffyProductCardSkeleton() }
    }
}
