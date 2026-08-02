package com.effyshopping.customer.mobile.features.catalog.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.presentation.DisplaySize
import com.effyshopping.customer.mobile.core.presentation.EffyCategoryShortcut
import com.effyshopping.customer.mobile.core.presentation.EffyDisplay
import com.effyshopping.customer.mobile.core.presentation.EffyEmptyState
import com.effyshopping.customer.mobile.core.presentation.EffyHomeSkeleton
import com.effyshopping.customer.mobile.core.presentation.EffyMinTouchTarget
import com.effyshopping.customer.mobile.core.presentation.EffyPromoBanner
import com.effyshopping.customer.mobile.core.presentation.EffyPullToRefresh
import com.effyshopping.customer.mobile.core.presentation.EffyRailTile
import com.effyshopping.customer.mobile.core.presentation.EffySectionHeader
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.customer.mobile.core.presentation.HomeSectionGap
import com.effyshopping.customer.mobile.core.presentation.RailItemGap
import com.effyshopping.customer.mobile.core.presentation.railTileWidthFraction
import com.effyshopping.customer.mobile.features.cart.presentation.CartAction
import com.effyshopping.customer.mobile.features.catalog.domain.Banner
import com.effyshopping.customer.mobile.features.catalog.domain.Rail
import com.effyshopping.customer.mobile.features.delivery.DeliveryBar
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_catalog_outlined
import com.effyshopping.customer.mobile.resources.ic_favorite_outlined
import com.effyshopping.customer.mobile.resources.ic_notifications_outlined
import com.effyshopping.customer.mobile.resources.ic_search_outlined
import com.effyshopping.mobile.design.EffyRadius
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.mobile.kit.ui.WindowWidth
import com.effyshopping.mobile.kit.ui.widthClassFor
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.painterResource

/**
 * The customer Home tab — a merchandised, sectioned storefront (028).
 *
 * ── ⚠ THIS REVERSES 026's FR-025a FOR THIS SCREEN ───────────────────────────────────────────────
 *
 * 026 replaced 025's rails with a single flat two-column "Discover" grid, filtered by chips. That
 * was a deliberate decision with a real virtue — product tiles reached the shopper without three
 * screens of chrome first — and it is reversed here on operator direction (028 FR-003).
 *
 * The virtue is NOT abandoned with it. It is now enforced as acceptance criteria the sectioned
 * layout has to meet: **SC-002** (a real product visible without scrolling) and **SC-006** (the last
 * section within four swipes). If either fails on device, this layout is wrong — not the criteria.
 *
 * The chips are gone with the grid. They existed because 026 had no rails to name; sections restore
 * what they were substituting for, and keeping both would leave two competing groupings on one
 * screen.
 *
 * ── The structure ───────────────────────────────────────────────────────────────────────────────
 *
 * Header · delivery bar · search entry, then a [LazyColumn] of blocks resolved by [composeHome]:
 * category shortcuts, then merchandising sections with promotional banners interleaved between
 * them. The interleaving rules live in that PURE function, not in this file — see `HomeBlocks.kt`
 * for why.
 *
 * ⚠ NOT a `LazyVerticalGrid` with spans. A `LazyRow` inside a lazy grid item is measured against an
 * infinite width constraint; a `LazyColumn` has no such interaction (research R3).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    container: AppContainer,
    onProductClick: (String) -> Unit,
    onSearch: () -> Unit = {},
    onNotifications: () -> Unit = {},
    onSaved: () -> Unit = {},
    onCart: () -> Unit = {},
    onSeeAll: (Rail) -> Unit = {},
    onCategoryClick: (CategoryShortcut) -> Unit = {},
    onBannerClick: (Banner) -> Unit = {},
) {
    val vm = viewModel { HomeViewModel(container.getHome, container.getCategories) }
    val state by vm.state.collectAsState()

    Column(modifier = Modifier.fillMaxSize().background(EffySurface.page)) {
        DiscoverHeader(
            container = container,
            onNotifications = onNotifications,
            onSaved = onSaved,
            onCart = onCart,
        )
        // 025 US1/FR-012: "do we deliver to you?", asked BEFORE a cart is built rather than at
        // checkout. It is not decoration — without it the first honest answer arrives after the
        // shopper has already invested in an order.
        DeliveryBar(container)
        SearchEntry(onSearch = onSearch)

        when (val s = state) {
            HomeUiState.Loading -> EffyHomeSkeleton(Modifier.padding(top = EffySpacing.md))

            HomeUiState.Error -> EffyEmptyState(
                title = "We couldn’t load the store",
                body = "Please try again in a moment.",
                icon = Res.drawable.ic_catalog_outlined,
                actionLabel = "Try again",
                onAction = vm::load,
            )

            is HomeUiState.Ready -> {
                val blocks = remember(s.home, s.categories) { composeHome(s.home, s.categories) }

                if (blocks.isEmpty()) {
                    // SC-012: exactly ONE empty state. Never a stack of empty section headings.
                    EffyEmptyState(
                        title = "Nothing here yet",
                        body = "Our catalogue is on its way. Check back soon.",
                        icon = Res.drawable.ic_catalog_outlined,
                    )
                } else {
                    // 025 FR-033: pull-to-refresh — a store whose stock and prices move needs a way
                    // to say "show me that again" that is not "kill the app".
                    //
                    // ⚠ 027 fixed two things here that must not regress: `isRefreshing` was
                    // hard-coded `false`, so the indicator NEVER appeared and the gesture looked
                    // like nothing had happened; and it called `load()`, which blanks the screen to
                    // a spinner — the shopper asked for a newer version of what they were looking
                    // at and got it taken away. The shared wrapper owns the flag, and `refresh()`
                    // leaves the content in place.
                    EffyPullToRefresh(
                        onRefresh = vm::refresh,
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        HomeBlockList(blocks, onProductClick, onSeeAll, onCategoryClick, onBannerClick)
                    }
                }
            }
        }
    }
}

/**
 * Home's vertical sequence.
 *
 * ⚠ The gap between blocks is set ONCE, here, by `verticalArrangement`. That is what makes SC-007
 * ("the gap between every adjacent pair of sections is identical") true by construction — there is
 * no per-block padding that could drift, and no call site that could forget.
 */
@Composable
private fun HomeBlockList(
    blocks: List<HomeBlock>,
    onProductClick: (String) -> Unit,
    onSeeAll: (Rail) -> Unit,
    onCategoryClick: (CategoryShortcut) -> Unit,
    onBannerClick: (Banner) -> Unit,
) {
    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val widthClass = widthClassFor(maxWidth)
        // ⚠ Resolved to a concrete Dp HERE, where the constraints are real. A LazyRow measures its
        // children with an unbounded main axis, so a fraction computed inside a rail item multiplies
        // infinity and bounds nothing (see EffyRailTile).
        val tileWidth = maxWidth * railTileWidthFraction(widthClass)

        LazyColumn(
            state = rememberLazyListState(),
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(HomeSectionGap),
            contentPadding = PaddingValues(top = EffySpacing.md, bottom = EffySpacing.xxxl),
        ) {
            items(blocks, key = { it.blockKey() }) { block ->
                when (block) {
                    is HomeBlock.Categories -> CategoryRow(block.items, onCategoryClick)
                    is HomeBlock.Promo -> PromoBlock(block.banners, onBannerClick)
                    is HomeBlock.Offers -> OffersSection(block.banners, onBannerClick)
                    is HomeBlock.Section -> SectionBlock(
                        rail = block.rail,
                        tileWidth = tileWidth,
                        onProductClick = onProductClick,
                        onSeeAll = { onSeeAll(block.rail) },
                    )
                }
            }
        }
    }
}

/**
 * The dedicated offers section (029 US3) — the store's current deals, in one place.
 *
 * ⚠ Titled, unlike 028's inline banners. The heading is what makes it findable: SC-012 asks that a
 * first-time shopper can say what the current offer is without being prompted to look for it, and an
 * untitled band of artwork between two product rails does not achieve that.
 *
 * One banner renders plain with **no position indicator** — a single-item carousel is a control that
 * lies about having somewhere to go. Several render in a pager that **never auto-advances** (FR-022).
 */
@Composable
private fun OffersSection(banners: List<Banner>, onBannerClick: (Banner) -> Unit) {
    if (banners.isEmpty()) return

    Column(
        // FR-025: a bounded, NAMED group, so a screen-reader user can step past the offers rather
        // than being walked through each one. `isTraversalGroup` is the half that does the bounding —
        // 028 learned that a contentDescription alone names without bounding.
        modifier = Modifier.semantics {
            isTraversalGroup = true
            contentDescription = "Offers, ${banners.size} available"
        },
    ) {
        EffySectionHeader("Offers")
        Box(modifier = Modifier.padding(top = EffySpacing.md)) {
            PromoBlock(banners, onBannerClick)
        }
    }
}

/**
 * Promotional banners at one point in the sequence (028 US4).
 *
 * One renders as a panel. Several render as a **pager with a position indicator** (FR-031) that
 * **never auto-advances** (FR-032) — mobile has no hover, so a shopper cannot pause a rotating
 * carousel and can be navigated somewhere they never chose. Baymard's carousel research is explicit
 * about this, and it is why the platform's only carousel is a manual one.
 */
@Composable
private fun PromoBlock(banners: List<Banner>, onBannerClick: (Banner) -> Unit) {
    if (banners.isEmpty()) return

    if (banners.size == 1) {
        val banner = banners.single()
        BannerPanel(banner, onBannerClick, Modifier.padding(horizontal = EffySpacing.lg))
        return
    }

    val pagerState = rememberPagerState(pageCount = { banners.size })
    Column {
        HorizontalPager(
            state = pagerState,
            contentPadding = PaddingValues(horizontal = EffySpacing.lg),
            pageSpacing = EffySpacing.md,
        ) { page ->
            BannerPanel(banners[page], onBannerClick)
        }

        // The position indicator. Monochrome, so presence is carried by FILL rather than by hue —
        // the current page is solid, the rest are the same colour at low alpha.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = EffySpacing.s)
                .semantics {
                    isTraversalGroup = true
                    contentDescription = "Promotion ${pagerState.currentPage + 1} of ${banners.size}"
                },
            horizontalArrangement = Arrangement.Center,
        ) {
            repeat(banners.size) { index ->
                Box(
                    modifier = Modifier
                        .padding(horizontal = 3.dp)
                        .size(6.dp)
                        .clip(CircleShape)
                        .background(
                            MaterialTheme.colorScheme.onSurface.copy(
                                alpha = if (index == pagerState.currentPage) 1f else 0.25f,
                            ),
                        ),
                )
            }
        }
    }
}

/**
 * One banner.
 *
 * ⚠ `onClick` is null when the banner has no target the app understands. That is the designed
 * response to an unrecognised wire value (research R7) — the copy still reads, the tap simply does
 * not pretend. A tap that does nothing is worse than no tap.
 */
@Composable
private fun BannerPanel(banner: Banner, onBannerClick: (Banner) -> Unit, modifier: Modifier = Modifier) {
    EffyPromoBanner(
        title = banner.title,
        subtitle = banner.subtitle,
        terms = banner.terms,
        code = banner.code,
        imageUrl = banner.imageUrl,
        onClick = if (banner.target != null) ({ onBannerClick(banner) }) else null,
        modifier = modifier,
    )
}

/**
 * The category shortcut row (028 US3).
 *
 * ⚠ It SCROLLS and carries every qualifying top-level category — it does not choose a subset. SC-004
 * asks for at least 30–40% of top-level categories, which the research frames as a floor guarding
 * against representing too narrow a slice of the catalogue. A row that scrolls has no reason to
 * choose, so it clears the floor by carrying all of them (research R11).
 *
 * What still needs care is what is visible BEFORE any scroll — that is the impression a first-time
 * shopper forms of what this store sells. Server order governs, so if similar categories cluster at
 * the front, the fix is merchandising in the store, not a client-side reshuffle.
 */
@Composable
private fun CategoryRow(items: List<CategoryShortcut>, onCategoryClick: (CategoryShortcut) -> Unit) {
    LazyRow(
        modifier = Modifier
            .fillMaxWidth()
            // FR-044: one bounded, named group — see SectionBlock for why isTraversalGroup is the
            // load-bearing half of this.
            .semantics {
                isTraversalGroup = true
                contentDescription = "Categories, ${items.size} available"
            },
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
        contentPadding = PaddingValues(horizontal = EffySpacing.md),
    ) {
        items(items, key = { it.key }) { shortcut ->
            EffyCategoryShortcut(
                label = shortcut.label,
                icon = categoryIcon(shortcut.key),
                onClick = { onCategoryClick(shortcut) },
            )
        }
    }
}

/** A stable identity per block, so a refresh reuses composition instead of rebuilding the screen. */
private fun HomeBlock.blockKey(): String = when (this) {
    is HomeBlock.Categories -> "categories"
    is HomeBlock.Section -> "section:${rail.key}"
    is HomeBlock.Promo -> "promo:${banners.joinToString(",") { it.key }}"
    is HomeBlock.Offers -> "offers:${banners.joinToString(",") { it.key }}"
}

/**
 * One merchandising section: a title with "see all", above a horizontally scrolling row.
 *
 * ⚠ The row is `LazyRow`, not a scrollable `Row`. With a dozen products a plain Row composes all of
 * them whether or not they are on screen, and the section's images all load at once — which is the
 * fastest way to lose SC-008's one-second image budget.
 *
 * The trailing peek (FR-015) is not drawn — it FALLS OUT of tile width. Each tile takes a fraction
 * of the window that leaves the next one partly visible, so a row with more items than fit shows a
 * sliver and a row that fits exactly does not (research R4).
 */
@Composable
private fun SectionBlock(
    rail: Rail,
    tileWidth: Dp,
    onProductClick: (String) -> Unit,
    onSeeAll: () -> Unit,
) {
    Column(
        // FR-044 / SC-010: a bounded, NAMED group a screen-reader user can step past, rather than
        // being walked through every product in an unbounded sideways list.
        //
        // ⚠ `isTraversalGroup` is the part that does the work. A `contentDescription` alone on a
        // container that does not merge its descendants just adds one more node to walk through —
        // it names the row without bounding it, which is the half of FR-044 that actually matters.
        modifier = Modifier.semantics {
            isTraversalGroup = true
            contentDescription = "${rail.title}, ${rail.products.size} products"
        },
    ) {
        EffySectionHeader(rail.title, onSeeAll = onSeeAll)

        LazyRow(
            modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.md),
            horizontalArrangement = Arrangement.spacedBy(RailItemGap),
            contentPadding = PaddingValues(horizontal = EffySpacing.lg),
        ) {
            items(rail.products, key = { it.id }) { product ->
                EffyRailTile(product, onProductClick, width = tileWidth)
            }
        }
    }
}

/**
 * The header: the screen name, and the affordances Effy's four-tab bar has nowhere else to put.
 *
 * ⚠ Saved and Cart live HERE because the tabs are Home · Search · Orders · Account. They must go
 * somewhere — for a while after the Nav3 migration they went nowhere at all, and the cart could be
 * filled and never opened.
 */
@Composable
private fun DiscoverHeader(
    container: AppContainer,
    onNotifications: () -> Unit,
    onSaved: () -> Unit,
    onCart: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        EffyDisplay("Discover", size = DisplaySize.Page, modifier = Modifier.weight(1f))
        CartAction(container, onCart)
        HeaderAction(Res.drawable.ic_favorite_outlined, "Saved items", onSaved)
        HeaderAction(Res.drawable.ic_notifications_outlined, "Notifications", onNotifications)
    }
}

/** One header affordance. */
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
 * The search entry (028 US1).
 *
 * ⚠ An AFFORDANCE, not an input. Tapping it opens Search with the field already focused and the
 * keyboard already up — one tap, no second (FR-008). Home deliberately does NOT accept text: a
 * second live search field here would be the one WITHOUT filters, sort or paging, and it would be
 * the one a shopper meets first (FR-009).
 *
 * ⚠ The dark square button that used to sit beside this is GONE. It was labelled "Filters", opened
 * Search, and applied no filter — an affordance that lied about what it did.
 */
@Composable
private fun SearchEntry(onSearch: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = EffySpacing.lg)
            .padding(bottom = EffySpacing.lg)
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
}
