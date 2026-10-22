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
import org.jetbrains.compose.resources.DrawableResource
import androidx.compose.foundation.selection.toggleable
import com.effyshopping.customer.mobile.core.presentation.EffyHairline
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.width

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
            // 087 (operator, 2026-10-15) — the results header was three stacked rows of 52dp boxes.
            // It is now two light rows with clear jobs:
            //   1. sub-aisles as TABS (navigation — where am I in this aisle), underlined, on a hairline;
            //   2. ONE scrolling row of 36dp pill chips (refinement — Filters, Sort, On sale, and each
            //      applied filter with its ×),
            // then a slim count line with "Clear all". Every chip keeps a 48dp touch target.
            if (aisleKey != null && subAisles.isNotEmpty()) {
                SubAisleTabs(
                    tabs = listOf(SubAisleTab(aisleKey, "All", null)) + subAisles.map { SubAisleTab(it.key, it.name, it.productCount) },
                    selectedKey = state.categoryKey,
                    onSelect = vm::applyCategory,
                )
            }

            var sorting by remember { mutableStateOf(false) }
            // The sale toggle is its own chip, so it is not repeated as a pill.
            val refinementPills = pills.filter { it.key != "sale" }
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
                contentPadding = PaddingValues(horizontal = EffySpacing.lg),
                modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.xs),
            ) {
                item(key = "filters") {
                    ToolbarChip(
                        "Filters",
                        selected = pills.isNotEmpty(),
                        leading = Res.drawable.lucide_sliders_horizontal,
                        badge = pills.size,
                        onClick = { showFilters = true },
                    )
                }
                item(key = "sort") {
                    // The ordering the SERVER applied — the requested one could misdescribe the list.
                    ToolbarChip(
                        "Sort: ${state.sort.label}",
                        trailing = Res.drawable.lucide_chevron_down,
                        onClickLabel = "Change sort, now ${state.sort.label}",
                        onClick = { sorting = true },
                    )
                }
                if (!entrySaleOnly) {
                    item(key = "sale") {
                        ToolbarChip("On sale", selected = state.saleOnly, toggle = true, onClick = vm::toggleSale)
                    }
                }
                items(refinementPills, key = { it.key }) { pill ->
                    ToolbarChip(
                        pill.label,
                        selected = true,
                        trailing = Res.drawable.lucide_x,
                        onClickLabel = "Remove ${pill.label}",
                        onClick = { pill.remove(vm) },
                    )
                }
            }
            if (sorting) {
                SortSheet(
                    current = state.sort,
                    queryPresent = state.query.isNotBlank(),
                    onSelect = { sorting = false; vm.applySort(it) },
                    onDismiss = { sorting = false },
                )
            }

            // The count, and "Clear all" once something is applied — one slim line, not a 48dp row.
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = EffySpacing.lg).heightIn(min = 32.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    when {
                        state.total != null -> "${state.total} ${if (state.total == 1) "result" else "results"}"
                        state.loading -> "Searching…"
                        else -> ""
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    // Announced, so a screen-reader user learns the set changed size (FR-045).
                    modifier = Modifier.weight(1f).semantics { liveRegion = LiveRegionMode.Polite },
                )
                if (pills.isNotEmpty()) EffyTextLink("Clear all", onClick = vm::clearRefinements)
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
                        cartQuantity = tileCart.quantityOf(product.variantId),
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

private data class SubAisleTab(val key: String, val label: String, val count: Int?)

/**
 * Sub-aisles as scrolling TABS (087): the label, its count in grey, and a 2dp underline under the
 * chosen one, on a hairline. Tabs, not chips — this row says WHERE you are; the chips below refine.
 */
@Composable
private fun SubAisleTabs(tabs: List<SubAisleTab>, selectedKey: String?, onSelect: (String) -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        LazyRow(
            contentPadding = PaddingValues(horizontal = EffySpacing.s),
            modifier = Modifier.fillMaxWidth().selectableGroup(),
        ) {
            items(tabs, key = { it.key }) { tab ->
                val selected = tab.key == selectedKey
                Column(
                    modifier = Modifier
                        .heightIn(min = EffySize.target)
                        .selectable(selected = selected, role = Role.Tab) { onSelect(tab.key) }
                        .padding(horizontal = EffySpacing.md)
                        // The underline spans the label: the column is as wide as its widest child.
                        .width(IntrinsicSize.Max),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Bottom,
                ) {
                    Row(
                        modifier = Modifier.padding(top = EffySpacing.md, bottom = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(
                            tab.label,
                            style = MaterialTheme.typography.labelLarge.copy(fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium),
                            color = if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        tab.count?.let {
                            Text("$it", style = MaterialTheme.typography.labelMedium.copy(fontFeatureSettings = "tnum"), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    Box(
                        Modifier
                            .height(2.dp)
                            .fillMaxWidth()
                            .clip(CircleShape)
                            .background(if (selected) MaterialTheme.colorScheme.onSurface else androidx.compose.ui.graphics.Color.Transparent),
                    )
                }
            }
        }
        EffyHairline(inset = false)
    }
}

/**
 * One refinement chip (087): a 36dp pill inside a 48dp touch target. Outlined at rest; solid black
 * when it is ON (a filter applied, sale on). An optional leading glyph, a count badge, and a trailing
 * chevron (opens a sheet) or × (removes it).
 */
@Composable
private fun ToolbarChip(
    label: String,
    selected: Boolean = false,
    leading: DrawableResource? = null,
    trailing: DrawableResource? = null,
    badge: Int = 0,
    toggle: Boolean = false,
    onClickLabel: String? = null,
    onClick: () -> Unit,
) {
    val interactions = remember { MutableInteractionSource() }
    val ink = if (selected) MaterialTheme.colorScheme.background else MaterialTheme.colorScheme.onSurface
    Box(
        modifier = Modifier
            .heightIn(min = EffySize.target)
            .effyPress(interactions, 0.95f)
            .then(
                if (toggle) Modifier.toggleable(value = selected, interactionSource = interactions, indication = null, role = Role.Switch) { onClick() }
                else Modifier.clickable(interactionSource = interactions, indication = null, role = Role.Button, onClickLabel = onClickLabel, onClick = onClick),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            modifier = Modifier
                .height(36.dp)
                .clip(CircleShape)
                .background(if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.background)
                .border(1.dp, if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline, CircleShape)
                .padding(start = if (leading != null) 12.dp else 14.dp, end = if (trailing != null || badge > 0) 10.dp else 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            leading?.let { Icon(painterResource(it), contentDescription = null, tint = ink, modifier = Modifier.size(16.dp)) }
            Text(label, style = MaterialTheme.typography.labelLarge, color = ink, maxLines = 1)
            if (badge > 0) {
                Box(
                    Modifier.size(20.dp).clip(CircleShape).background(if (selected) MaterialTheme.colorScheme.background else MaterialTheme.colorScheme.primary),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "$badge",
                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold, fontFeatureSettings = "tnum"),
                        color = if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onPrimary,
                    )
                }
            }
            trailing?.let { Icon(painterResource(it), contentDescription = null, tint = ink, modifier = Modifier.size(16.dp)) }
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

/** "Sort by" (087 — every choice is a bottom sheet; no drop-down menus). */
@Composable
private fun SortSheet(
    current: ProductSortOption,
    queryPresent: Boolean,
    onSelect: (ProductSortOption) -> Unit,
    onDismiss: () -> Unit,
) {
    val options = ProductSortOption.entries.filter { it != ProductSortOption.RELEVANCE || queryPresent }
    EffySheet(title = "Sort by", onDismiss = onDismiss, cancelLabel = "Cancel") {
        Column(Modifier.selectableGroup()) {
            options.forEach { option ->
                EffyRadioRow(label = option.label, selected = option == current, onClick = { onSelect(option) })
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
