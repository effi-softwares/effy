package com.effyshopping.customer.mobile.features.catalog.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.presentation.ProductImage
import com.effyshopping.customer.mobile.features.catalog.domain.Banner
import com.effyshopping.customer.mobile.features.catalog.domain.Category
import com.effyshopping.customer.mobile.features.catalog.domain.ProductBadge
import com.effyshopping.customer.mobile.features.catalog.domain.ProductCard
import com.effyshopping.customer.mobile.features.catalog.domain.Rail
import com.effyshopping.mobile.design.EffyRadius
import com.effyshopping.mobile.design.EffySpacing

/**
 * The customer Home tab (019 US1). A merchandised, scrolling store: a promo banner, category chips, and
 * horizontally scrolling product rails — real catalog data from the hot path. GUEST-FIRST: no session
 * needed. Product tiles are the Principle V card exception (the industry-standard commerce pattern).
 *
 * [onProductClick] is wired to product-detail navigation by US2; here it is provided by the shell.
 * Product images load from the presigned S3 URL via Coil3 ([ProductImage]), falling back to a
 * first-letter placeholder while loading or when a product has no image.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(container: AppContainer, onProductClick: (String) -> Unit) {
    val vm = viewModel { HomeViewModel(container.getHome, container.getCategories) }
    val state by vm.state.collectAsState()

    when (val s = state) {
        HomeUiState.Loading -> HomeSkeleton()
        HomeUiState.Error -> ErrorState(onRetry = vm::load)
        is HomeUiState.Ready ->
            if (s.home.rails.isEmpty()) {
                EmptyStore()
            } else {
                // 025 FR-033: pull-to-refresh. A store whose stock and prices move needs a way to say
                // "show me that again" that is not "kill the app".
                PullToRefreshBox(
                    isRefreshing = false,
                    onRefresh = vm::load,
                    modifier = Modifier.fillMaxSize(),
                ) {
                    HomeList(s.home, s.categories, onProductClick)
                }
            }
    }
}

@Composable
private fun HomeList(home: com.effyshopping.customer.mobile.features.catalog.domain.HomeContent, categories: List<Category>, onProductClick: (String) -> Unit) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = EffySpacing.md),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.s),
    ) {
        if (home.banners.isNotEmpty()) {
            item(key = "banners") { BannerCarousel(home.banners) }
        }
        if (categories.isNotEmpty()) {
            item { CategoryChipsRow(categories) }
        }
        items(home.rails, key = { it.key }) { rail ->
            RailRow(rail, onProductClick)
        }
    }
}

/**
 * The promotional carousel (025 FR-019).
 *
 * ⚠ What this replaced: a single flat block of brand colour with a heading on it — the first thing on
 * the storefront, and it looked like a placeholder because it was one. `Banner` has carried an
 * `imageUrl` since 019; nothing ever read it.
 *
 * A single promotion is NOT presented as a carousel: no pager semantics, no dots (FR-019).
 */
@Composable
private fun BannerCarousel(banners: List<Banner>) {
    if (banners.isEmpty()) return
    val pagerState = rememberPagerState(pageCount = { banners.size })

    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
        HorizontalPager(
            state = pagerState,
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = EffySpacing.lg),
            pageSpacing = EffySpacing.md,
            userScrollEnabled = banners.size > 1,
        ) { page ->
            BannerSlide(banners[page])
        }

        if (banners.size > 1) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
            ) {
                repeat(banners.size) { index ->
                    val selected = pagerState.currentPage == index
                    Box(
                        modifier = Modifier
                            .padding(horizontal = EffySpacing.xs)
                            .size(if (selected) 8.dp else 6.dp)
                            .clip(CircleShape)
                            .background(
                                if (selected) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.outlineVariant,
                            ),
                    )
                }
            }
        }
    }
}

@Composable
private fun BannerSlide(banner: Banner) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(168.dp)
            .clip(RoundedCornerShape(EffyRadius.md))
            .background(MaterialTheme.colorScheme.primary),
    ) {
        banner.imageUrl?.let {
            ProductImage(it, banner.title, modifier = Modifier.fillMaxSize())
            // A scrim, so the copy stays legible over ANY photograph rather than only the ones we
            // happened to test with.
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.35f)),
            )
        }
        Column(
            modifier = Modifier.align(Alignment.BottomStart).padding(EffySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(EffySpacing.xs),
        ) {
            Text(
                banner.title,
                style = MaterialTheme.typography.headlineSmall,
                color = if (banner.imageUrl != null) Color.White else MaterialTheme.colorScheme.onPrimary,
            )
            banner.subtitle?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (banner.imageUrl != null) Color.White else MaterialTheme.colorScheme.onPrimary,
                )
            }
        }
    }
}

@Composable
private fun CategoryChipsRow(categories: List<Category>) {
    LazyRow(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = EffySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
    ) {
        items(categories, key = { it.key }) { category ->
            Surface(
                shape = RoundedCornerShape(50),
                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                color = MaterialTheme.colorScheme.surface,
            ) {
                Text(
                    category.name,
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun RailRow(rail: Rail, onProductClick: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
        Text(
            rail.title,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(horizontal = EffySpacing.lg),
        )
        LazyRow(
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = EffySpacing.lg),
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
        ) {
            items(rail.products, key = { it.id }) { product ->
                ProductTile(product, onProductClick)
            }
        }
    }
}

@Composable
private fun ProductTile(product: ProductCard, onProductClick: (String) -> Unit) {
    Column(
        modifier = Modifier.width(150.dp).clickable { onProductClick(product.id) },
        verticalArrangement = Arrangement.spacedBy(EffySpacing.xs),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(RoundedCornerShape(EffyRadius.sm))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(EffyRadius.sm)),
            contentAlignment = Alignment.Center,
        ) {
            ProductImage(product.imageUrl, product.name, modifier = Modifier.fillMaxSize())
            if (product.badges.isNotEmpty()) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(8.dp),
                    horizontalArrangement = Arrangement.spacedBy(EffySpacing.xs),
                ) {
                    product.badges.forEach { badge ->
                        Surface(
                            color = MaterialTheme.colorScheme.primary,
                            contentColor = MaterialTheme.colorScheme.onPrimary,
                            shape = RoundedCornerShape(50),
                        ) {
                            Text(
                                badgeLabel(badge),
                                style = MaterialTheme.typography.labelSmall,
                                modifier = Modifier.padding(horizontal = EffySpacing.s, vertical = EffySpacing.xs),
                            )
                        }
                    }
                }
            }
        }
        product.brand?.let {
            Text(
                it,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            product.name,
            style = MaterialTheme.typography.bodyMedium,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
            Text(money(product.priceAmount, product.currency), style = MaterialTheme.typography.titleSmall)
            product.compareAtAmount?.let {
                Text(
                    money(it, product.currency),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/**
 * A content-shaped first-load placeholder (025 FR-032).
 *
 * ⚠ This replaced a bare `CircularProgressIndicator` centred on an empty screen. A spinner tells a
 * shopper that something is happening; a skeleton tells them WHAT is coming, which is the difference
 * between waiting and wondering whether the app is broken.
 */
@Composable
private fun HomeSkeleton() {
    Column(
        modifier = Modifier.fillMaxSize().padding(vertical = EffySpacing.md),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.lg),
    ) {
        Box(
            modifier = Modifier
                .padding(horizontal = EffySpacing.lg)
                .fillMaxWidth()
                .height(168.dp)
                .clip(RoundedCornerShape(EffyRadius.md))
                .background(MaterialTheme.colorScheme.surfaceVariant),
        )
        repeat(2) {
            Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
                Box(
                    modifier = Modifier
                        .padding(horizontal = EffySpacing.lg)
                        .width(140.dp)
                        .height(18.dp)
                        .clip(RoundedCornerShape(EffyRadius.sm))
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                )
                Row(
                    modifier = Modifier.padding(horizontal = EffySpacing.lg),
                    horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
                ) {
                    repeat(3) {
                        Box(
                            modifier = Modifier
                                .width(150.dp)
                                .height(200.dp)
                                .clip(RoundedCornerShape(EffyRadius.sm))
                                .background(MaterialTheme.colorScheme.surfaceVariant),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyStore() {
    CenterBox {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
            Text("The shelves are still being stocked", style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
            Text(
                "Our catalogue is on its way. Check back soon.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun ErrorState(onRetry: () -> Unit) {
    CenterBox {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
            Text("We couldn’t load the store", style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
            Button(onClick = onRetry) { Text("Try again") }
        }
    }
}

@Composable
private fun CenterBox(content: @Composable () -> Unit) {
    Box(modifier = Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) { content() }
}

/** AUD money — the wire amount is already a 2-dp decimal string (numeric(12,2)::text), so prefix "$". */
private fun money(amount: String, currency: String): String =
    if (currency == "AUD") "$$amount" else "$currency $amount"

private fun badgeLabel(badge: ProductBadge): String = when (badge) {
    ProductBadge.ON_SALE -> "Sale"
    ProductBadge.NEW -> "New"
}
