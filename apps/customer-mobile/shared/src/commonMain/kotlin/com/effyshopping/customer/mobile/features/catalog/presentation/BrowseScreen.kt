package com.effyshopping.customer.mobile.features.catalog.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.presentation.EffySkeletonBlock
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.customer.mobile.core.presentation.ProductGridGutter
import com.effyshopping.customer.mobile.core.presentation.ProductGridPadding
import com.effyshopping.customer.mobile.core.presentation.ProductGridRowGap
import com.effyshopping.customer.mobile.core.presentation.ProductImage
import com.effyshopping.customer.mobile.features.catalog.domain.Category
import com.effyshopping.mobile.design.EffyRadius
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.mobile.kit.ui.EffyPlaceholder
import com.effyshopping.mobile.kit.ui.EffyTopBar

/**
 * Browse (025 US1 / FR-010) — every category, at parity with the web `/browse` index.
 *
 * ⚠ Category tiles are the Principle V card exception recorded in research.md R11: an EXTENSION of
 * the existing product-tile exception, not a new class of card. Same pattern — a navigable catalogue
 * entity presented for visual scanning — applied to the same kind of thing.
 *
 * Imagery is DERIVED server-side from a product in the category (categories store no images, and
 * FR-001 forbids adding a column). A category whose products have none renders a typed tile, never a
 * broken frame.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BrowseScreen(container: AppContainer, onCategoryClick: (String) -> Unit) {
    val vm = viewModel { BrowseViewModel(container.getCategories) }
    val state by vm.state.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        EffyTopBar(title = "Browse")

        when (val s = state) {
            BrowseUiState.Loading -> BrowseSkeleton()

            BrowseUiState.Error -> EffyPlaceholder(
                title = "We couldn’t load the categories",
                description = "Please try again in a moment — or search for what you need.",
            )

            is BrowseUiState.Ready ->
                if (s.groups.isEmpty()) {
                    EffyPlaceholder(
                        title = "The shelves are still being stocked",
                        description = "Our catalogue is on its way. Check back soon.",
                    )
                } else {
                    PullToRefreshBox(
                        isRefreshing = false,
                        onRefresh = vm::load,
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        CategoryGrid(s.groups, onCategoryClick)
                    }
                }
        }
    }
}

@Composable
private fun CategoryGrid(groups: List<CategoryGroup>, onCategoryClick: (String) -> Unit) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = Modifier.fillMaxSize(),
        contentPadding = ProductGridPadding,
        horizontalArrangement = Arrangement.spacedBy(ProductGridGutter),
        verticalArrangement = Arrangement.spacedBy(ProductGridRowGap),
    ) {
        groups.forEach { group ->
            // A single ungrouped list (flat taxonomy) needs no section heading.
            if (groups.size > 1 || group.children.first().key != group.root.key) {
                item(span = { GridItemSpan(maxLineSpan) }, key = "hdr-${group.root.key}") {
                    Text(
                        group.root.name,
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                        modifier = Modifier.padding(top = EffySpacing.s),
                    )
                }
            }
            items(group.children, key = { "${group.root.key}:${it.key}" }) { category ->
                CategoryTile(category, onCategoryClick)
            }
        }
    }
}

@Composable
private fun CategoryTile(category: Category, onClick: (String) -> Unit) {
    Column(
        modifier = Modifier.clickable { onClick(category.key) },
        verticalArrangement = Arrangement.spacedBy(EffySpacing.xs),
    ) {
        // ⚠ No border and no shadow — the tint alone separates the tile from the page, matching the
        // web's `CategoryTile`. The 1.dp outline this used to draw fragmented the grid into boxes.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(4f / 3f)
                .clip(RoundedCornerShape(EffyRadius.md))
                .background(EffySurface.tint),
            contentAlignment = Alignment.Center,
        ) {
            // ProductImage already falls back to a first-letter tile when the URL is null, which is
            // exactly the behaviour a category with no derivable imagery needs.
            ProductImage(category.imageUrl, category.name, modifier = Modifier.fillMaxSize())
        }
        Text(
            category.name,
            modifier = Modifier.padding(top = EffySpacing.s),
            style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            "${category.productCount} ${if (category.productCount == 1) "item" else "items"}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/**
 * A content-shaped first-load placeholder (FR-032).
 *
 * The shape of what is coming, not a spinner on an empty screen — a shopper should be able to tell
 * they are waiting for a grid of categories rather than for something unknown.
 */
@Composable
private fun BrowseSkeleton() {
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = Modifier.fillMaxSize(),
        contentPadding = ProductGridPadding,
        horizontalArrangement = Arrangement.spacedBy(ProductGridGutter),
        verticalArrangement = Arrangement.spacedBy(ProductGridRowGap),
        userScrollEnabled = false,
    ) {
        items(List(8) { it }) {
            Column {
                EffySkeletonBlock(Modifier.fillMaxWidth().aspectRatio(4f / 3f))
                EffySkeletonBlock(
                    Modifier.padding(top = EffySpacing.s).fillMaxWidth(0.7f).height(16.dp),
                    radius = EffyRadius.sm,
                )
            }
        }
    }
}
