package com.effyshopping.customer.mobile.features.catalog.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.presentation.DisplaySize
import com.effyshopping.customer.mobile.core.presentation.EffyDisplay
import com.effyshopping.customer.mobile.core.presentation.EffyHairline
import com.effyshopping.customer.mobile.core.presentation.EffyProductCard
import com.effyshopping.customer.mobile.core.presentation.EffyProductCardSkeleton
import com.effyshopping.customer.mobile.core.presentation.EffySectionHeader
import com.effyshopping.customer.mobile.core.presentation.EffySkeletonBlock
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.customer.mobile.core.presentation.ProductImage
import com.effyshopping.customer.mobile.features.catalog.domain.Banner
import com.effyshopping.customer.mobile.features.catalog.domain.Category
import com.effyshopping.customer.mobile.features.catalog.domain.HomeContent
import com.effyshopping.customer.mobile.features.catalog.domain.Rail
import com.effyshopping.mobile.design.EffyRadius
import com.effyshopping.mobile.design.EffySpacing

/**
 * The customer Home tab — a merchandised, scrolling store.
 *
 * ── 025: recomposed to match the web storefront ─────────────────────────────────────────────────
 *
 * The section order is `apps/customer-web/app/(shop)/page.tsx`'s, so a shopper who uses both
 * surfaces meets the same store in the same order:
 *
 *   hero band  →  promo carousel  →  product rails (each closed by a hairline)  →  shop by category
 *
 * The delivery location sits above this, in the shell's `HomeStackHost` — the mobile equivalent of
 * the web header's delivery affordance.
 *
 * GUEST-FIRST: no session needed anywhere on this screen.
 *
 * ⚠ Every tile is [EffyProductCard], the shared card. Home, Search and Favourites each used to draw
 * their own, which is how they ended up with three different tints and two different price
 * treatments for the same product.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    container: AppContainer,
    onProductClick: (String) -> Unit,
    onBrowse: () -> Unit = {},
    onSeeAll: (railKey: String) -> Unit = {},
    onCategoryClick: (String) -> Unit = {},
) {
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
                    HomeList(s.home, s.categories, onProductClick, onBrowse, onSeeAll, onCategoryClick)
                }
            }
    }
}

@Composable
private fun HomeList(
    home: HomeContent,
    categories: List<Category>,
    onProductClick: (String) -> Unit,
    onBrowse: () -> Unit,
    onSeeAll: (String) -> Unit,
    onCategoryClick: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = EffySpacing.xxxl),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.xl),
    ) {
        item(key = "hero") { HeroBand(onBrowse) }

        if (home.banners.isNotEmpty()) {
            item(key = "banners") { PromoCarousel(home.banners) }
        }

        // The hairline closes each rail EXCEPT the last, where the category panel below already
        // provides the separation — the same rule the web page follows.
        home.rails.forEachIndexed { index, rail ->
            item(key = rail.key) {
                Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.xl)) {
                    RailSection(rail, onProductClick, onSeeAll)
                    if (index < home.rails.lastIndex) EffyHairline()
                }
            }
        }

        if (categories.any { it.productCount > 0 }) {
            item(key = "categories") { CategoryPanel(categories, onCategoryClick) }
        }
    }
}

/**
 * The hero (web `Hero.tsx`).
 *
 * A tinted full-bleed band, an oversized display headline, a short supporting line, one pill CTA,
 * and a row of statistics.
 *
 * ⚠ Effy's numbers are REAL or absent. The reference template ships "200+ International Brands /
 * 2,000+ High-Quality Products / 30,000+ Happy Customers"; on a store with 38 seeded products that
 * is a lie printed at display size. These three state things that are true of the platform as built.
 *
 * ⚠ The web draws hairline dividers between the stats only from `sm` up — on a phone it drops them,
 * so this does too. Three columns of small type at 390dp do not need vertical rules to separate them.
 */
@Composable
private fun HeroBand(onShopNow: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(EffySurface.tint)
            .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.xxxl),
    ) {
        EffyDisplay("Everything you need, delivered", size = DisplaySize.Hero)

        Text(
            "Fresh groceries and everyday essentials from one brand. Browse without an account — " +
                "we only ask who you are when you place an order.",
            modifier = Modifier.padding(top = EffySpacing.lg),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Button(
            onClick = onShopNow,
            shape = CircleShape,
            modifier = Modifier
                .padding(top = EffySpacing.xl)
                .heightIn(min = 52.dp)
                .fillMaxWidth(),
        ) { Text("Shop now") }

        Row(
            modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.xxxl),
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
        ) {
            HeroStat("One", "basket, one delivery", Modifier.weight(1f))
            HeroStat("No account", "needed to browse", Modifier.weight(1f))
            HeroStat("Same day", "in serviced areas", Modifier.weight(1f))
        }
    }
}

@Composable
private fun HeroStat(value: String, label: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Text(
            value,
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
            // ⚠ Two lines, not one. These are three columns at a third of the screen each; at
            // maximum text size "No account" on one line ellipsizes to "No acc…", which reads as a
            // rendering bug rather than as a claim about the store.
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            label,
            modifier = Modifier.padding(top = 2.dp),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/**
 * The promotional carousel (025 FR-019, restyled to the web's `PromoCarousel`).
 *
 * A single promotion is NOT presented as a carousel: no pager gesture, no dots. Dots that never move
 * are a control that lies about there being more to see.
 */
@Composable
private fun PromoCarousel(banners: List<Banner>) {
    if (banners.isEmpty()) return
    val pagerState = rememberPagerState(pageCount = { banners.size })

    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
        HorizontalPager(
            state = pagerState,
            contentPadding = PaddingValues(horizontal = EffySpacing.lg),
            pageSpacing = EffySpacing.md,
            userScrollEnabled = banners.size > 1,
        ) { page -> PromoSlide(banners[page]) }

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
                                if (selected) {
                                    MaterialTheme.colorScheme.onSurface
                                } else {
                                    MaterialTheme.colorScheme.outlineVariant
                                },
                            ),
                    )
                }
            }
        }
    }
}

@Composable
private fun PromoSlide(banner: Banner) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(16f / 9f)
            .clip(RoundedCornerShape(EffyRadius.md))
            .background(EffySurface.tint),
    ) {
        banner.imageUrl?.let {
            ProductImage(it, banner.title, modifier = Modifier.fillMaxSize())
            // A gradient scrim only where the copy sits, so the copy survives ANY photograph rather
            // than only the ones we happened to test with — and the top of the image stays visible.
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            0.35f to Color.Transparent,
                            1f to Color.Black.copy(alpha = 0.65f),
                        ),
                    ),
            )
        }
        Column(
            modifier = Modifier.align(Alignment.BottomStart).padding(EffySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(EffySpacing.xs),
        ) {
            val onImage = banner.imageUrl != null
            EffyDisplay(
                banner.title,
                size = DisplaySize.Sub,
                color = if (onImage) Color.White else MaterialTheme.colorScheme.onSurface,
            )
            banner.subtitle?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (onImage) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/** A merchandising rail: header with "See all", a horizontal row of the shared product card. */
@Composable
private fun RailSection(rail: Rail, onProductClick: (String) -> Unit, onSeeAll: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.lg)) {
        EffySectionHeader(rail.title, onSeeAll = { onSeeAll(rail.key) })
        LazyRow(
            contentPadding = PaddingValues(horizontal = EffySpacing.lg),
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.lg),
        ) {
            items(rail.products, key = { it.id }) { product ->
                EffyProductCard(product, onProductClick, modifier = Modifier.width(164.dp))
            }
        }
    }
}

/**
 * "Shop by category" (web `CategoryMosaic.tsx`).
 *
 * The web's composition is a large tinted ROUNDED PANEL containing the heading and an ASYMMETRIC
 * mosaic — rows split 1:2 then 2:1. That imbalance is what stops it reading as another uniform grid,
 * and it is the most recognisable block on the web home page.
 *
 * ⚠ The asymmetry does NOT survive a 390dp phone: at half width a "2-span" tile is 340dp and a
 * "1-span" tile is 160dp, so the mosaic degrades into two mismatched tiles per row rather than a
 * composition. Mobile keeps the tinted panel, the heading and the tile treatment — and lays them out
 * as an even 2×2. Same block, adapted; not a different block.
 *
 * ⚠ Note the DOUBLE inversion, matching the web: the panel is the tint and the tiles inside it are
 * the page colour. A tinted tile on a tinted panel would be invisible.
 */
@Composable
private fun CategoryPanel(categories: List<Category>, onCategoryClick: (String) -> Unit) {
    val featured = categories.filter { it.productCount > 0 }.take(4)
    if (featured.isEmpty()) return

    Column(
        modifier = Modifier
            .padding(horizontal = EffySpacing.lg)
            .clip(RoundedCornerShape(EffyRadius.md))
            .background(EffySurface.tint)
            .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.xxxl),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.xl),
    ) {
        EffyDisplay(
            "Shop by category",
            size = DisplaySize.Section,
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.Center,
        )

        // Plain Rows, not a LazyVerticalGrid — a lazy grid inside a LazyColumn has unbounded height
        // and crashes at measure time. Four tiles never need lazy layout anyway.
        featured.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
                row.forEach { category ->
                    CategoryTile(category, onCategoryClick, Modifier.weight(1f))
                }
                // Keeps a lone trailing tile at half width instead of stretching it across the row.
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun CategoryTile(category: Category, onClick: (String) -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            // ⚠ `heightIn`, not a fixed height: the category name sits INSIDE this box, so at
            // maximum text size a two-line name would be clipped by the tile that contains it.
            .heightIn(min = 132.dp)
            .clip(RoundedCornerShape(EffyRadius.sm))
            .background(EffySurface.page)
            .clickable(
                onClickLabel = "${category.name}, ${category.productCount} " +
                    if (category.productCount == 1) "item" else "items",
            ) { onClick(category.key) },
    ) {
        ProductImage(category.imageUrl, category.name, modifier = Modifier.fillMaxSize())

        // A scrim only where the label sits, so the label survives any photograph without dimming
        // the whole tile.
        // The scrim is sized as a FRACTION of the tile rather than a fixed 64dp, so it still sits
        // behind the label once the label grows.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.55f)
                .background(
                    Brush.verticalGradient(
                        0f to MaterialTheme.colorScheme.surface.copy(alpha = 0.85f),
                        1f to Color.Transparent,
                    ),
                ),
        )
        Text(
            category.name,
            modifier = Modifier.align(Alignment.TopStart).padding(EffySpacing.md),
            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * A content-shaped first-load placeholder (025 FR-032) — reshaped to the new composition, so the
 * skeleton predicts the page that replaces it rather than the page this screen used to be.
 */
@Composable
private fun HomeSkeleton() {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.xl),
    ) {
        // The hero band.
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(EffySurface.tint)
                .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.xxxl),
            verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
        ) {
            EffySkeletonBlock(Modifier.fillMaxWidth().height(36.dp))
            EffySkeletonBlock(Modifier.fillMaxWidth(0.8f).height(36.dp))
            EffySkeletonBlock(Modifier.padding(top = EffySpacing.lg).fillMaxWidth().height(52.dp))
        }

        repeat(2) {
            Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.lg)) {
                EffySkeletonBlock(
                    Modifier.padding(horizontal = EffySpacing.lg).width(180.dp).height(26.dp),
                )
                Row(
                    modifier = Modifier.padding(horizontal = EffySpacing.lg),
                    horizontalArrangement = Arrangement.spacedBy(EffySpacing.lg),
                ) {
                    repeat(3) { EffyProductCardSkeleton(Modifier.width(164.dp)) }
                }
            }
        }
    }
}

@Composable
private fun EmptyStore() {
    CenterBox {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(EffySpacing.s),
        ) {
            EffyDisplay(
                "The shelves are still being stocked",
                size = DisplaySize.Sub,
                textAlign = TextAlign.Center,
            )
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
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(EffySpacing.lg),
        ) {
            EffyDisplay("We couldn’t load the store", size = DisplaySize.Sub, textAlign = TextAlign.Center)
            Button(onClick = onRetry, shape = CircleShape, modifier = Modifier.heightIn(min = 52.dp)) {
                Text("Try again")
            }
        }
    }
}

@Composable
private fun CenterBox(content: @Composable () -> Unit) {
    Box(
        modifier = Modifier.fillMaxSize().padding(EffySpacing.xxxl),
        contentAlignment = Alignment.Center,
    ) { content() }
}
