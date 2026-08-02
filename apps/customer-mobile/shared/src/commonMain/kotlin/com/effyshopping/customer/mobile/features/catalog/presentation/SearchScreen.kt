package com.effyshopping.customer.mobile.features.catalog.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyButtonShape
import com.effyshopping.customer.mobile.core.presentation.EffyEmptyState
import com.effyshopping.customer.mobile.core.presentation.EffyProductCard
import com.effyshopping.customer.mobile.core.presentation.EffyProductCardSkeleton
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.customer.mobile.core.presentation.ProductGridGutter
import com.effyshopping.customer.mobile.core.presentation.ProductGridPadding
import com.effyshopping.customer.mobile.core.presentation.ProductGridRowGap
import com.effyshopping.customer.mobile.features.cart.presentation.CartAction
import com.effyshopping.customer.mobile.features.catalog.domain.ProductSortOption
import com.effyshopping.customer.mobile.features.saved.presentation.SavedTileMessages
import com.effyshopping.customer.mobile.features.saved.presentation.TileSaveControl
import com.effyshopping.customer.mobile.features.saved.presentation.rememberSavedTiles
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_search_outlined
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.mobile.kit.ui.EffyPlaceholder
import com.effyshopping.mobile.kit.ui.EffyTopBar

/**
 * Search (019 US4, extended by 025 US1).
 *
 * Query input, refinement chips, a SORT control and a RESULT COUNT; results in a grid with keyset
 * infinite scroll. Only available products (server-enforced).
 *
 * ── Entry refinement: removed by 026, RESTORED by 028 ───────────────────────────────────────────
 *
 * 025 gave this screen `categoryKey` and `saleOnly` entry parameters, fed by the Browse tab. 026
 * removed Browse, which left them with no caller, so they were deleted — and the comment here
 * predicted the way back: "the natural entry is the Discover chips handing off here".
 *
 * 028 took that way back, by a better door. The chips are gone with the grid; Home's SECTIONS hand
 * off instead, via `CustomerNavKey.Results`. `SearchViewModel` kept `applyCategory`/`applySaleOnly`
 * throughout — the seam was never removed, only orphaned.
 *
 * ⚠ This screen is now reached two ways, and the difference matters: as the **Search tab** (no
 * refinement, `autoFocus` when the shopper tapped Home's search entry) and as a **scoped result
 * set** pushed from Home (an entry refinement and its own title). One screen, one search field
 * (FR-009) — never two half-searches.
 */
@Composable
fun SearchScreen(
    container: AppContainer,
    onProductClick: (String) -> Unit,
    onCart: () -> Unit = {},
    /**
     * Open with the field focused and the keyboard up (028 FR-008).
     *
     * ⚠ Passed by the caller, never assumed. Always focusing would throw the keyboard over the
     * results every time a shopper returned to the Search tab from the bottom bar to *read* them.
     * Focus is requested by whoever meant it — Home's search entry.
     */
    autoFocus: Boolean = false,
    /**
     * An entry refinement, applied ONCE on arrival (028 US2/US3).
     *
     * Set when the shopper arrives from Home's "see all" or a category shortcut — they already know
     * what they want, so the screen opens already showing it.
     */
    entryCategoryKey: String? = null,
    entrySaleOnly: Boolean = false,
    /**
     * What the shopper is looking at (FR-018/FR-027).
     *
     * ⚠ A scoped list that does not say what it is scoped TO looks like a broken search. Arriving
     * from "On sale" must say "On sale", not "Search".
     */
    title: String = "Search",
) {
    val vm = viewModel { SearchViewModel(container.searchProducts) }
    val state by vm.state.collectAsState()
    // 033 FR-007/FR-020: ONE membership read for the whole grid, and one mirror every tile's heart
    // reads — never a boolean per tile, and never a request per product.
    val savedTiles = rememberSavedTiles(container)
    val gridState = rememberLazyGridState()
    val focusRequester = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current

    // ⚠ The field's TEXT belongs to the ViewModel; its CARET and SELECTION belong here. Selection is
    // genuine UI state — it has no meaning to the search — so hoisting it into the ViewModel would
    // put a presentation concern in the domain-facing layer for nothing.
    var field by remember { mutableStateOf(TextFieldValue(state.query, TextRange(state.query.length))) }

    // ── FR-008 + FR-012a ────────────────────────────────────────────────────────────────────────
    //
    // One tap on Home must land here with a live caret. An EXISTING query is KEPT, not cleared
    // (FR-012a) — a shopper who searched "oat milk", opened a product and came back should find
    // their results, not an empty screen.
    //
    // But a kept query the shopper has to delete character by character is worse than a cleared one,
    // so the text arrives SELECTED: typing replaces it in one action.
    //
    // Keyed on `autoFocus` so it fires on arrival rather than once per composition.
    LaunchedEffect(autoFocus) {
        if (autoFocus) {
            field = field.copy(selection = TextRange(0, field.text.length))
            focusRequester.requestFocus()
        }
    }

    // ── Entry refinement (028 T023) ─────────────────────────────────────────────────────────────
    //
    // ⚠ `applySaleOnly`, NEVER `toggleSale`. Its own doc comment spells out why: the caller here is
    // entry navigation, not a tap. Toggling would clear the filter whenever the shopper arrived at a
    // screen that already had it on — the classic bug where a link means the opposite of itself on
    // second use.
    //
    // Keyed on the refinements so it applies on arrival and never fights the shopper afterwards: if
    // they clear the chip, this must not put it straight back.
    LaunchedEffect(entryCategoryKey, entrySaleOnly) {
        if (entryCategoryKey != null) vm.applyCategory(entryCategoryKey)
        if (entrySaleOnly) vm.applySaleOnly(true)
    }

    val loadMore by remember {
        derivedStateOf {
            val last = gridState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1
            last >= state.items.size - 4 && state.cursor != null && !state.loading
        }
    }
    LaunchedEffect(loadMore) { if (loadMore) vm.loadMore() }

    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = title, trailing = { CartAction(container, onCart) })
        // Without this a refusal — the guest cap most of all — is silent, and a heart that flips
        // itself back looks like a bug rather than a limit.
        SavedTileMessages(savedTiles)

        Column(modifier = Modifier.padding(horizontal = EffySpacing.md)) {
            // A pill on the tint, matching the web header's search control. `placeholder` rather
            // than `label`: a floating label inside a pill collides with the rounded edge, and the
            // field is unambiguous under a screen titled "Search".
            OutlinedTextField(
                value = field,
                onValueChange = {
                    field = it
                    vm.onQueryChange(it.text)
                },
                placeholder = { Text("Search groceries, brands and more…") },
                singleLine = true,
                shape = EffyButtonShape,
                // FR-010: the keyboard's action key says "Search" and, on press, gets out of the way
                // so the results are not obscured by the thing used to ask for them. A blank query
                // does nothing and keeps focus (FR-011) — the search has already run reactively, so
                // there is no second request to fire here.
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(
                    onSearch = { if (field.text.isNotBlank()) keyboard?.hide() },
                ),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = EffySurface.tint,
                    unfocusedContainerColor = EffySurface.tint,
                    focusedBorderColor = MaterialTheme.colorScheme.outline,
                    unfocusedBorderColor = Color.Transparent,
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = EffySpacing.s)
                    .focusRequester(focusRequester),
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
                        // 033 FR-007: save from the tile, without opening the product first. ⚠ Unlike
                        // web — which omits the control on `/search` alone, and only because the route
                        // had 0.1 KB of a 174 KB budget left — mobile carries it on EVERY tile
                        // surface. There is no bundle to spend here, and this one screen IS search,
                        // browse, category and "see all", so omitting it would take the control off
                        // four surfaces at once.
                        imageOverlay = { TileSaveControl(product, savedTiles) },
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
