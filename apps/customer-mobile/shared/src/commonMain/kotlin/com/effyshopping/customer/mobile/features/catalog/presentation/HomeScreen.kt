package com.effyshopping.customer.mobile.features.catalog.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.presentation.DisplaySize
import com.effyshopping.customer.mobile.core.presentation.EffyChip
import com.effyshopping.customer.mobile.core.presentation.EffyDisplay
import com.effyshopping.customer.mobile.core.presentation.EffyEmptyState
import com.effyshopping.customer.mobile.core.presentation.EffyMinTouchTarget
import com.effyshopping.customer.mobile.core.presentation.EffyProductCard
import com.effyshopping.customer.mobile.core.presentation.EffyProductCardSkeleton
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.customer.mobile.core.presentation.ProductGridGutter
import com.effyshopping.customer.mobile.core.presentation.ProductGridPadding
import com.effyshopping.customer.mobile.core.presentation.ProductGridRowGap
import com.effyshopping.customer.mobile.features.catalog.domain.HomeContent
import com.effyshopping.customer.mobile.features.catalog.domain.ProductCard
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_catalog_outlined
import com.effyshopping.customer.mobile.features.cart.presentation.CartAction
import com.effyshopping.customer.mobile.features.delivery.DeliveryBar
import com.effyshopping.customer.mobile.resources.ic_favorite_outlined
import com.effyshopping.customer.mobile.resources.ic_notifications_outlined
import com.effyshopping.customer.mobile.resources.ic_search_outlined
import com.effyshopping.mobile.design.EffyRadius
import com.effyshopping.mobile.design.EffySpacing
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.painterResource

/**
 * The customer Home tab — the source design's **Discover** screen (026 T049, FR-025a).
 *
 * ── ⚠ THIS WAS REBUILT, NOT RESTYLED ────────────────────────────────────────────────────────────
 *
 * What stood here was the WEB storefront's page, ported to mobile by 025: a tinted hero band with a
 * headline and statistics, a promo carousel, horizontally-scrolling product rails each closed by a
 * hairline, and a category panel at the bottom. That is a good desktop merchandising page and it is
 * not what the source design does on a phone.
 *
 * The source's Discover screen is four things, in this order:
 *
 *   1. a plain "Discover" title with a notifications bell
 *   2. a persistent search entry with a filter affordance beside it
 *   3. a horizontally-scrolling row of category chips, "All" first
 *   4. a two-column product grid, filling the rest of the screen
 *
 * The whole screen is a browsable grid. There is no hero, no carousel, and no rails — merchandising
 * happens through the chips, which is why the grid can start above the fold instead of below three
 * screens of chrome.
 *
 * ⚠ WHAT IS DELIBERATELY KEPT FROM 025 (FR-025b): pull-to-refresh, content-shaped skeletons, the
 * shared product tile with its press feedback and reduced-motion path, and the shared grid rhythm.
 * Those are platform requirements, not the old layout.
 *
 * ⚠ NO NEW SERVER CAPABILITY (FR-002). The chips filter the products the home read ALREADY returns,
 * client-side. Reaching for a per-category endpoint would have been the easy call and the wrong one:
 * Search owns real refinement and paging. This screen shows what is on the home rails, grouped — it
 * is a shop window, not a search results page.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    container: AppContainer,
    onProductClick: (String) -> Unit,
    onSearch: () -> Unit = {},
    onNotifications: () -> Unit = {},
    onCart: () -> Unit = {},
    onFavorites: () -> Unit = {},
) {
    val vm = viewModel { HomeViewModel(container.getHome, container.getCategories) }
    val state by vm.state.collectAsState()

    Column(modifier = Modifier.fillMaxSize().background(EffySurface.page)) {
        DiscoverHeader(
            container = container,
            onNotifications = onNotifications,
            onCart = onCart,
            onFavorites = onFavorites,
        )
        // 025 US1/FR-012: "do we deliver to you?", asked BEFORE a cart is built rather than at
        // checkout. It is not decoration — without it the first honest answer arrives after the
        // shopper has already invested in an order.
        DeliveryBar(container)
        SearchEntry(onSearch = onSearch)

        when (val s = state) {
            HomeUiState.Loading -> DiscoverSkeleton()

            HomeUiState.Error -> EffyEmptyState(
                title = "We couldn’t load the store",
                body = "Please try again in a moment.",
                icon = Res.drawable.ic_catalog_outlined,
                actionLabel = "Try again",
                onAction = vm::load,
            )

            is HomeUiState.Ready ->
                if (s.home.rails.isEmpty()) {
                    EffyEmptyState(
                        title = "Nothing here yet",
                        body = "Our catalogue is on its way. Check back soon.",
                        icon = Res.drawable.ic_catalog_outlined,
                    )
                } else {
                    // 025 FR-033: pull-to-refresh survives the rebuild — a store whose stock and
                    // prices move needs a way to say "show me that again" that is not "kill the app".
                    PullToRefreshBox(
                        isRefreshing = false,
                        onRefresh = vm::load,
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        DiscoverGrid(s.home, onProductClick)
                    }
                }
        }
    }
}

/**
 * The source's header: the screen name, and a bell for notifications.
 *
 * ⚠ The bell used to be `ic_orders_outlined` — the SAME receipt glyph the bottom bar uses for Orders,
 * so one icon carried two meanings on one screen. The set simply had no bell; there is one now.
 */
@Composable
private fun DiscoverHeader(
    container: AppContainer,
    onNotifications: () -> Unit,
    onCart: () -> Unit,
    onFavorites: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        EffyDisplay("Discover", size = DisplaySize.Page, modifier = Modifier.weight(1f))
        HeaderAction(Res.drawable.ic_favorite_outlined, "Saved items", onFavorites)
        CartAction(container, onCart)
        HeaderAction(Res.drawable.ic_notifications_outlined, "Notifications", onNotifications)
    }
}

/**
 * One header affordance.
 *
 * ⚠ Saved and Cart live HERE because Effy's four tabs are Home · Search · Orders · Account. The source
 * kit puts Saved and Cart in its bottom bar; Effy's bar carries neither, so the header is where they go
 * instead — and they must go somewhere, because for a while after the Nav3 migration they went nowhere
 * at all: the cart could be filled and never opened.
 */
@Composable
private fun HeaderAction(icon: DrawableResource, label: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(EffyMinTouchTarget)
            .clip(RoundedCornerShape(EffyRadius.sm))
            .clickable(onClickLabel = label, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            painterResource(icon),
            contentDescription = label,
            modifier = Modifier.size(24.dp),
        )
    }
}

/**
 * The source's search row: a wide search field with a filter button beside it.
 *
 * ⚠ Both are AFFORDANCES, not inputs. Tapping either opens the Search tab, which owns the real query
 * field, the refinements and the paging. Putting a second live search input here would mean two
 * places that both half-search, and the one on Home would be the one without filters or paging.
 */
@Composable
private fun SearchEntry(onSearch: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = EffySpacing.lg)
            .padding(bottom = EffySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .heightIn(min = 52.dp)
                .clip(RoundedCornerShape(EffyRadius.sm))
                .background(EffySurface.tint)
                .clickable(onClickLabel = "Search products", onClick = onSearch)
                .padding(horizontal = EffySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
        ) {
            Icon(
                painterResource(Res.drawable.ic_search_outlined),
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                "Search the store…",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        // The source's dark filter button. Refinement lives in Search, so this opens it there.
        Box(
            modifier = Modifier
                .size(52.dp)
                .clip(RoundedCornerShape(EffyRadius.sm))
                .background(MaterialTheme.colorScheme.primary)
                .clickable(onClickLabel = "Filter products", onClick = onSearch),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                painterResource(Res.drawable.ic_catalog_outlined),
                contentDescription = "Filters",
                modifier = Modifier.size(22.dp),
                tint = MaterialTheme.colorScheme.onPrimary,
            )
        }
    }
}

/**
 * The chip row + the two-column grid.
 *
 * The chips filter [HomeContent]'s products client-side. A product appears on more than one rail in
 * principle, so the grid is de-duplicated by id — without that, "All" would show the same product
 * twice whenever two rails overlap, which reads as a data bug rather than as merchandising.
 */
@Composable
private fun DiscoverGrid(
    home: HomeContent,
    onProductClick: (String) -> Unit,
) {
    var selected by remember { mutableStateOf<String?>(null) }

    val allProducts: List<ProductCard> = remember(home) {
        home.rails.flatMap { it.products }.distinctBy { it.id }
    }

    // ⚠ A rail product carries no category key, so filtering has to go through the rail whose title
    // matches the chip. That is the honest limit of doing this client-side; a chip with no matching
    // rail falls back to showing everything rather than an empty grid.
    val shown: List<ProductCard> = remember(selected, home, allProducts) {
        val key = selected ?: return@remember allProducts
        val rail = home.rails.firstOrNull { it.key == key || it.title.equals(key, ignoreCase = true) }
        rail?.products?.distinctBy { it.id } ?: allProducts
    }

    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        horizontalArrangement = Arrangement.spacedBy(ProductGridGutter),
        verticalArrangement = Arrangement.spacedBy(ProductGridRowGap),
        contentPadding = ProductGridPadding,
        modifier = Modifier.fillMaxSize(),
    ) {
        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
            CategoryChips(
                rails = home.rails.map { it.key to it.title },
                selected = selected,
                onSelect = { selected = it },
            )
        }

        items(shown, key = { it.id }) { product ->
            EffyProductCard(product, onClick = onProductClick, fillHeight = true)
        }
    }
}

/**
 * The source's chip row — "All" first, then the store's own groupings.
 *
 * ⚠ The chips are the RAILS, not the category tree. A rail is a merchandising grouping the home read
 * already returns WITH its products, so a rail chip can filter the grid on the spot. A category chip
 * could not: a `ProductCard` carries no category key, so selecting one would need a fetch, and this
 * screen is deliberately a shop window rather than a second search implementation (see the header).
 * ⚠ These chips are the app's ONLY category affordance now. The Browse tab that walked the real
 * category tree was removed at the operator's instruction, so what remains is this client-side
 * grouping of the home rails — narrower than a category index, and deliberately so.
 */
@Composable
private fun CategoryChips(
    rails: List<Pair<String, String>>,
    selected: String?,
    onSelect: (String?) -> Unit,
) {
    LazyRow(
        modifier = Modifier.fillMaxWidth().padding(bottom = EffySpacing.s),
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
        contentPadding = PaddingValues(horizontal = 0.dp),
    ) {
        item(key = "all") {
            EffyChip("All", selected = selected == null, onClick = { onSelect(null) })
        }
        items(rails, key = { it.first }) { (key, title) ->
            EffyChip(title, selected = selected == key, onClick = { onSelect(key) })
        }
    }
}

/** A content-shaped first load (025 FR-032), matching the grid that replaces it. */
@Composable
private fun DiscoverSkeleton() {
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
