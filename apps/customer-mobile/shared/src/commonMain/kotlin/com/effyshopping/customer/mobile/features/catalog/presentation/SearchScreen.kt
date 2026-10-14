package com.effyshopping.customer.mobile.features.catalog.presentation

import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import com.effyshopping.customer.mobile.resources.lucide_sliders_horizontal
import com.effyshopping.customer.mobile.resources.lucide_chevron_down
import com.effyshopping.customer.mobile.resources.lucide_chevron_right
import com.effyshopping.customer.mobile.resources.lucide_tag
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import com.effyshopping.customer.mobile.core.theme.EffyRoles
import com.effyshopping.customer.mobile.core.presentation.effyPress
import com.effyshopping.customer.mobile.core.presentation.EffyBadge
import com.effyshopping.customer.mobile.core.presentation.EffyChevron
import com.effyshopping.customer.mobile.core.presentation.EffyGhostButton
import org.jetbrains.compose.resources.painterResource
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.runtime.produceState
import com.effyshopping.customer.mobile.resources.lucide_x
import com.effyshopping.customer.mobile.resources.lucide_history
import com.effyshopping.customer.mobile.features.catalog.domain.subAislesOf
import com.effyshopping.customer.mobile.features.catalog.domain.aisleOf
import com.effyshopping.customer.mobile.features.catalog.domain.RecentSearch
import com.effyshopping.customer.mobile.features.catalog.domain.Category
import com.effyshopping.customer.mobile.core.presentation.EffyIconButton
import com.effyshopping.customer.mobile.core.presentation.EffySize
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.ui.input.nestedscroll.nestedScroll
import com.effyshopping.customer.mobile.resources.lucide_search
import com.effyshopping.customer.mobile.features.cart.presentation.rememberTileCart
import com.effyshopping.customer.mobile.core.presentation.rememberEffyCollapse
import com.effyshopping.customer.mobile.core.presentation.EffyErrorState
import com.effyshopping.customer.mobile.core.presentation.EffyTextLink
import com.effyshopping.customer.mobile.core.presentation.EffySearchField
import androidx.compose.foundation.selection.selectableGroup
import com.effyshopping.customer.mobile.core.presentation.EffyRadioRow
import com.effyshopping.customer.mobile.core.presentation.EffySheet
import com.effyshopping.customer.mobile.core.presentation.EffyChip
import com.effyshopping.customer.mobile.core.presentation.EffyScreenHeader
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
import androidx.compose.material3.MaterialTheme
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
    /** 068: where the list chooser sends a guest who wants a named list. */
    onRequireSignIn: (() -> Unit)? = null,
    /** 087 (Search board): the start page's aisle tiles, "All products" and "On sale". */
    onAisle: (Category) -> Unit = {},
    onAllProducts: () -> Unit = {},
    onSale: () -> Unit = {},
) {
    val vm = viewModel { SearchViewModel(container.searchProducts, container.getFacets) }
    val state by vm.state.collectAsState()
    // 033 FR-007/FR-020: ONE membership read for the whole grid, and one mirror every tile's heart
    // reads — never a boolean per tile, and never a request per product.
    val savedTiles = rememberSavedTiles(container, onRequireSignIn)
    val gridState = rememberLazyGridState()
    val focusRequester = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current

    // ⚠ The field's TEXT belongs to the ViewModel; its CARET and SELECTION belong here. Selection is
    // genuine UI state — it has no meaning to the search — so hoisting it into the ViewModel would
    // put a presentation concern in the domain-facing layer for nothing.
    var field by remember { mutableStateOf(TextFieldValue(state.query, TextRange(state.query.length))) }
    // 043 US1: the advanced filter bottom sheet.
    var showFilters by remember { mutableStateOf(false) }

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

    val tileCart = rememberTileCart(container)
    val collapse = rememberEffyCollapse()
    // 087 FR-036 — this device's recent searches (never sent anywhere).
    val recents by container.recentSearches.searches.collectAsState()
    fun record(text: String) {
        if (text.isNotBlank()) container.recordSearch(text, kotlin.time.Clock.System.now().toEpochMilliseconds())
    }
    // 087 FR-035 — the aisle's sub-aisles, from the categories the platform already serves.
    val categories by produceState(emptyList<Category>()) { value = runCatching { container.getCategories() }.getOrDefault(emptyList()) }
    val aisleKey = entryCategoryKey?.let { aisleOf(it, categories) }
    val subAisles = aisleKey?.let { subAislesOf(it, categories) }.orEmpty()
    val openProduct: (String) -> Unit = { id ->
        // Opening a result is as good a signal as the search key that this search was worth keeping.
        record(state.query)
        onProductClick(id)
    }

    // 087 (Search board): the Search tab with nothing typed and nothing applied is a START page —
    // recent searches and the aisles — not an empty results screen.
    val browsing = entryCategoryKey == null && !entrySaleOnly && state.query.isBlank() &&
        state.activeFilterCount == 0 && state.items.isEmpty()
    // Filters the shopper applied, as removable pills (Results board). The aisle itself is not one —
    // the title and the sub-aisle chips already say it — unless it was chosen in the filter sheet.
    val pills = appliedFilterPills(state, aisleScoped = entryCategoryKey != null)
    val saleCount by produceState<Int?>(null, browsing) {
        if (browsing) value = runCatching { container.searchProducts(query = "", saleOnly = true).total }.getOrNull()
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // 087: the large title at the tab root, "‹ Back" + title when pushed as Results.
        EffyScreenHeader(
            title = title,
            collapse = collapse,
            search = {
                EffySearchField(
                    value = field,
                    onValueChange = {
                        field = it
                        vm.onQueryChange(it.text)
                    },
                    placeholder = if (entryCategoryKey != null || entrySaleOnly) "Search in $title" else "Search groceries and essentials…",
                    // FR-010: the keyboard's action key gets out of the way so the results show. A
                    // blank query keeps focus (FR-011) — the search has already run reactively.
                    onSearch = {
                        if (field.text.isNotBlank()) {
                            record(field.text)
                            keyboard?.hide()
                        }
                    },
                    focusRequester = focusRequester,
                )
            },
        )
        // Without this a refusal — the guest cap most of all — is silent.
        SavedTileMessages(savedTiles)

        if (!browsing) {
            // Sub-aisles (Results board): "All" plus each sub-aisle with its count; the chosen one is
            // solid black. Choosing one narrows the results.
            if (aisleKey != null && subAisles.isNotEmpty()) {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
                    contentPadding = PaddingValues(horizontal = EffySpacing.lg),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    item(key = "all") { SubAisleChip("All", null, selected = state.categoryKey == aisleKey) { vm.applyCategory(aisleKey) } }
                    items(subAisles, key = { it.key }) { sub ->
                        SubAisleChip(sub.name, sub.productCount, selected = state.categoryKey == sub.key) { vm.applyCategory(sub.key) }
                    }
                }
            }

            // Filters + sort (Results board): an outlined Filters button with its count, and the sort
            // as a full-width selector that opens a sheet.
            Row(
                // 087 — tight under the search field (operator: "reduce these spaces").
                modifier = Modifier.fillMaxWidth().padding(start = EffySpacing.lg, end = EffySpacing.lg, top = EffySpacing.xs),
                horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                FiltersButton(count = pills.size, onClick = { showFilters = true })
                SortControl(
                    // The ordering the SERVER applied — the requested one could misdescribe the list.
                    current = state.sort,
                    queryPresent = state.query.isNotBlank(),
                    onSelect = vm::applySort,
                    modifier = Modifier.weight(1f),
                )
            }

            // Applied filters as pills, "Clear all", and the count on the right.
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = EffySpacing.lg)
                    // A 48dp row only when there are pills to tap; the count alone is a line of text.
                    .heightIn(min = if (pills.isNotEmpty()) EffySize.target else 32.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                LazyRow(modifier = Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
                    items(pills, key = { it.key }) { pill -> FilterPill(pill.label, onRemove = { pill.remove(vm) }) }
                    if (pills.isNotEmpty()) item(key = "clear") { EffyTextLink("Clear all", onClick = vm::clearRefinements) }
                }
                Text(
                    when {
                        state.total != null -> "${state.total} ${if (state.total == 1) "result" else "results"}"
                        state.loading -> "Searching…"
                        else -> ""
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    // Announced, so a screen-reader user learns the set changed size (FR-045).
                    modifier = Modifier.padding(start = EffySpacing.s).semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
        }

        when {
            browsing -> SearchStart(
                recents = recents,
                aisles = categories.filter { it.parentKey == null && it.productCount > 0 },
                saleCount = saleCount,
                onPickRecent = { text ->
                    field = TextFieldValue(text, TextRange(text.length))
                    vm.onQueryChange(text)
                    record(text)
                    keyboard?.hide()
                },
                onClearRecents = { container.clearRecentSearches() },
                onAisle = onAisle,
                onAllProducts = onAllProducts,
                onSale = onSale,
            )

            state.items.isEmpty() && state.loading -> SearchSkeleton()

            // 087 — a failure always offers a retry (it had none).
            state.failed ->
                EffyErrorState(
                    title = "We couldn’t load results",
                    body = "Please try again in a moment.",
                    onRetry = vm::retry,
                )

            state.items.isEmpty() ->
                EffyEmptyState(
                    title = if (state.query.isBlank()) "Nothing here yet" else "No results for “${state.query}”",
                    body = if (pills.isNotEmpty()) {
                        "Your filters may be too narrow — try removing one."
                    } else {
                        "Try a different search, or browse the store by aisle."
                    },
                    icon = Res.drawable.lucide_search,
                    actionLabel = if (pills.isNotEmpty()) "Clear filters" else null,
                    onAction = if (pills.isNotEmpty()) vm::clearRefinements else null,
                )

            else -> LazyVerticalGrid(
                state = gridState,
                columns = GridCells.Fixed(2),
                horizontalArrangement = Arrangement.spacedBy(ProductGridGutter),
                verticalArrangement = Arrangement.spacedBy(ProductGridRowGap),
                contentPadding = PaddingValues(start = EffySpacing.lg, end = EffySpacing.lg, top = EffySpacing.xs, bottom = EffySpacing.lg),
                modifier = Modifier.fillMaxSize().nestedScroll(collapse.connection),
            ) {
                items(state.items, key = { it.id }) { product ->
                    // `fillHeight` pins every price row in a row of results to the same baseline —
                    // the tallest name in the row sets the height and the prices stay level.
                    EffyProductCard(
                        product,
                        openProduct,
                        modifier = Modifier.fillMaxHeight(),
                        fillHeight = true,
                        // 033 FR-007: save from the tile, without opening the product first. ⚠ Unlike
                        // web — which omits the control on `/search` alone, and only because the route
                        // had 0.1 KB of a 174 KB budget left — mobile carries it on EVERY tile
                        // surface. There is no bundle to spend here, and this one screen IS search,
                        // browse, category and "see all", so omitting it would take the control off
                        // four surfaces at once.
                        imageOverlay = { TileSaveControl(product, savedTiles) },
                        cartQuantity = tileCart.quantityOf(product.id),
                        onCartQuantityChange = { tileCart.change(product, it) },
                    )
                }
                // 087 (Results board) — "Loading more…" while the next page loads (there was nothing).
                if (state.loading && state.items.isNotEmpty()) {
                    item(key = "more", span = { GridItemSpan(maxLineSpan) }) {
                        Row(
                            Modifier.fillMaxWidth().padding(EffySpacing.lg),
                            horizontalArrangement = Arrangement.spacedBy(EffySpacing.s, Alignment.CenterHorizontally),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text("Loading more…", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }

        // 043 US1: the advanced filter bottom sheet.
        if (showFilters) {
            FilterSheet(
                state = state,
                onDismiss = { showFilters = false },
                onToggleSale = vm::toggleSale,
                onCategory = vm::applyCategory,
                onToggleBrand = vm::toggleBrand,
                onToggleAttribute = vm::toggleAttribute,
                onApplyPrice = vm::applyPrice,
                onClearAll = vm::clearRefinements,
            )
        }
    }
}

/**
 * The Search tab's START page (Search board): recent searches (newest first, "Clear" removes them all),
 * then "Browse the aisles" — an "On sale" row in Effy green and the top-level aisles as two-up tiles
 * with their product counts.
 */
@Composable
private fun SearchStart(
    recents: List<RecentSearch>,
    aisles: List<Category>,
    saleCount: Int?,
    onPickRecent: (String) -> Unit,
    onClearRecents: () -> Unit,
    onAisle: (Category) -> Unit,
    onAllProducts: () -> Unit,
    onSale: () -> Unit,
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = EffySpacing.lg, end = EffySpacing.lg, top = EffySpacing.md, bottom = EffySpacing.xxxl),
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
    ) {
        if (recents.isNotEmpty()) {
            item(key = "recent-head", span = { GridItemSpan(maxLineSpan) }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Recent searches", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                    EffyGhostButton("Clear", onClick = onClearRecents)
                }
            }
            item(key = "recent-list", span = { GridItemSpan(maxLineSpan) }) {
                Column(Modifier.offset(y = (-EffySpacing.md))) {
                    recents.forEach { recent ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = EffySize.row)
                                .clickable(role = Role.Button, onClickLabel = "Search ${recent.text}") { onPickRecent(recent.text) },
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
                        ) {
                            Icon(painterResource(Res.drawable.lucide_history), contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
                            Text(recent.text, style = MaterialTheme.typography.bodyLarge.copy(fontSize = 17.sp), modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            EffyChevron()
                        }
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    }
                }
            }
        }

        item(key = "aisles-head", span = { GridItemSpan(maxLineSpan) }) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = if (recents.isNotEmpty()) EffySpacing.md else 0.dp)) {
                Text("Browse the aisles", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                EffyTextLink("All products", onClick = onAllProducts)
            }
        }
        item(key = "sale", span = { GridItemSpan(maxLineSpan) }) {
            val interactions = remember { MutableInteractionSource() }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 64.dp)
                    .effyPress(interactions, 0.98f)
                    .clip(EffyStorefrontShape.card)
                    .background(EffyRoles.brandMuted)
                    .clickable(interactionSource = interactions, indication = null, role = Role.Button, onClick = onSale)
                    .padding(horizontal = EffySpacing.lg),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
            ) {
                Icon(painterResource(Res.drawable.lucide_tag), contentDescription = null, tint = EffyRoles.brand, modifier = Modifier.size(22.dp))
                Text("On sale", style = MaterialTheme.typography.bodyLarge.copy(fontSize = 17.sp, fontWeight = FontWeight.Medium), color = EffyRoles.brand, modifier = Modifier.weight(1f))
                if (saleCount != null) Text("$saleCount", style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"), color = EffyRoles.brand)
                Icon(painterResource(Res.drawable.lucide_chevron_right), contentDescription = null, tint = EffyRoles.brand, modifier = Modifier.size(20.dp))
            }
        }
        items(aisles, key = { it.key }) { aisle ->
            val interactions = remember { MutableInteractionSource() }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 72.dp)
                    .effyPress(interactions, 0.97f)
                    .clip(EffyStorefrontShape.card)
                    .border(1.dp, MaterialTheme.colorScheme.outline, EffyStorefrontShape.card)
                    .clickable(interactionSource = interactions, indication = null, role = Role.Button, onClickLabel = aisle.name) { onAisle(aisle) }
                    .padding(horizontal = EffySpacing.md, vertical = EffySpacing.s),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
            ) {
                Box(Modifier.size(48.dp).clip(CircleShape).background(EffySurface.tint), contentAlignment = Alignment.Center) {
                    Icon(painterResource(categoryIcon("${aisle.key} ${aisle.name}")), contentDescription = null, modifier = Modifier.size(22.dp))
                }
                Column(Modifier.weight(1f)) {
                    Text(aisle.name, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text("${aisle.productCount} products", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

/** A sub-aisle chip (Results board): outlined with its count; the chosen one is solid black. */
@Composable
private fun SubAisleChip(label: String, count: Int?, selected: Boolean, onClick: () -> Unit) {
    val interactions = remember { MutableInteractionSource() }
    Row(
        modifier = Modifier
            .heightIn(min = EffySize.target)
            .effyPress(interactions, 0.95f)
            .clip(EffyStorefrontShape.control)
            .background(if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.background)
            .border(1.dp, if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline, EffyStorefrontShape.control)
            .selectable(selected = selected, interactionSource = interactions, indication = null, role = Role.Tab, onClick = onClick)
            .padding(horizontal = EffySpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = if (selected) MaterialTheme.colorScheme.background else MaterialTheme.colorScheme.onSurface)
        if (count != null) Text("$count", style = MaterialTheme.typography.labelMedium.copy(fontFeatureSettings = "tnum"), color = if (selected) MaterialTheme.colorScheme.background else MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** "Filters" (Results board): an outlined button with the sliders glyph and a blue count badge. */
@Composable
private fun FiltersButton(count: Int, onClick: () -> Unit) {
    val interactions = remember { MutableInteractionSource() }
    Row(
        modifier = Modifier
            .heightIn(min = EffySize.target + 4.dp)
            .effyPress(interactions, 0.97f)
            .clip(EffyStorefrontShape.control)
            .border(1.dp, MaterialTheme.colorScheme.outline, EffyStorefrontShape.control)
            .clickable(interactionSource = interactions, indication = null, role = Role.Button, onClickLabel = "Filters", onClick = onClick)
            .padding(horizontal = EffySpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
    ) {
        Icon(painterResource(Res.drawable.lucide_sliders_horizontal), contentDescription = null, modifier = Modifier.size(20.dp))
        Text("Filters", style = MaterialTheme.typography.labelLarge)
        if (count > 0) EffyBadge(count)
    }
}

/** An applied filter as a removable grey pill (Results board). */
@Composable
private fun FilterPill(label: String, onRemove: () -> Unit) {
    Row(
        modifier = Modifier
            .heightIn(min = EffySize.target)
            .clickable(role = Role.Button, onClickLabel = "Remove $label", onClick = onRemove),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier.clip(EffyStorefrontShape.control).background(EffySurface.tint).padding(horizontal = EffySpacing.md, vertical = EffySpacing.s),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(label, style = MaterialTheme.typography.labelMedium)
            Icon(painterResource(Res.drawable.lucide_x), contentDescription = null, modifier = Modifier.size(14.dp))
        }
    }
}

/** One applied filter: what it is called, and how to take it off. */
private class AppliedFilter(val key: String, val label: String, val remove: (SearchViewModel) -> Unit)

/** The applied filters, labelled as the facets name them. */
private fun appliedFilterPills(state: SearchUiState, aisleScoped: Boolean): List<AppliedFilter> = buildList {
    val facets = state.facetSet?.facets.orEmpty()
    fun labelOf(facetKey: String, value: String) =
        facets.firstOrNull { it.key == facetKey }?.options?.firstOrNull { it.value == value }?.label ?: value
    if (state.saleOnly) add(AppliedFilter("sale", "On sale") { it.toggleSale() })
    if (!aisleScoped) state.categoryKey?.let { key -> add(AppliedFilter("category", labelOf("category", key)) { it.applyCategory(null) }) }
    if (state.minPrice != null || state.maxPrice != null) {
        val label = listOfNotNull(state.minPrice?.let { "$$it" }, state.maxPrice?.let { "$$it" }).joinToString(" – ")
        add(AppliedFilter("price", if (state.maxPrice == null) "From $label" else if (state.minPrice == null) "Up to $label" else label) { it.applyPrice(null, null) })
    }
    state.brands.forEach { b -> add(AppliedFilter("brand:$b", labelOf("brand", b)) { it.toggleBrand(b) }) }
    state.attributes.forEach { (k, vs) -> vs.forEach { v -> add(AppliedFilter("attr:$k:$v", labelOf(k, v)) { it.toggleAttribute(k, v) }) } }
}

/** The ordering control (Results board): a full-width selector showing the order, opening a sheet. */
@Composable
private fun SortControl(
    current: ProductSortOption,
    queryPresent: Boolean,
    onSelect: (ProductSortOption) -> Unit,
    modifier: Modifier = Modifier,
) {
    var open by remember { mutableStateOf(false) }
    val options = ProductSortOption.entries.filter { it != ProductSortOption.RELEVANCE || queryPresent }
    val interactions = remember { MutableInteractionSource() }
    Row(
        modifier = modifier
            .heightIn(min = EffySize.target + 4.dp)
            .effyPress(interactions, 0.98f)
            .clip(EffyStorefrontShape.control)
            .border(1.dp, MaterialTheme.colorScheme.outline, EffyStorefrontShape.control)
            .clickable(interactionSource = interactions, indication = null, role = Role.Button, onClickLabel = "Sort: ${current.label}") { open = true }
            .padding(horizontal = EffySpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(current.label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f), maxLines = 1)
        Icon(painterResource(Res.drawable.lucide_chevron_down), contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
    }
    // 087 — every choice is a bottom sheet (no drop-down menus).
    if (open) {
        EffySheet(title = "Sort by", onDismiss = { open = false }, cancelLabel = "Cancel") {
            Column(Modifier.selectableGroup()) {
                options.forEach { option ->
                    EffyRadioRow(
                        label = option.label,
                        selected = option == current,
                        onClick = {
                            open = false
                            onSelect(option)
                        },
                    )
                }
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
