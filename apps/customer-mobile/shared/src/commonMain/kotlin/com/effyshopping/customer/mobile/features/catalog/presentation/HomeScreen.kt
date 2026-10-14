package com.effyshopping.customer.mobile.features.catalog.presentation

import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.runtime.produceState
import com.effyshopping.customer.mobile.resources.lucide_coins
import com.effyshopping.customer.mobile.resources.lucide_truck
import com.effyshopping.customer.mobile.resources.lucide_gift
import com.effyshopping.customer.mobile.features.checkout.presentation.orderArrivalLine
import com.effyshopping.customer.mobile.features.checkout.presentation.orderStageWord
import com.effyshopping.customer.mobile.features.points.presentation.formatPoints
import com.effyshopping.customer.mobile.features.points.domain.PointsBalance
import com.effyshopping.customer.mobile.features.checkout.domain.OrderSummary
import com.effyshopping.customer.mobile.core.session.SessionState
import com.effyshopping.customer.mobile.core.theme.EffyRoles
import com.effyshopping.customer.mobile.core.presentation.money
import com.effyshopping.customer.mobile.core.presentation.EffyCard
import com.effyshopping.customer.mobile.core.presentation.EffyOfferCard
import com.effyshopping.customer.mobile.core.presentation.EffyHeroBanner
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.height
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.ui.input.nestedscroll.nestedScroll
import com.effyshopping.customer.mobile.resources.lucide_shopping_basket
import com.effyshopping.customer.mobile.features.cart.presentation.rememberTileCart
import com.effyshopping.customer.mobile.features.cart.presentation.TileCart
import com.effyshopping.customer.mobile.core.presentation.effyDuration
import com.effyshopping.customer.mobile.core.presentation.EffyStorefrontMotion
import com.effyshopping.customer.mobile.core.presentation.EffyCollapseState
import com.effyshopping.customer.mobile.core.presentation.rememberEffyCollapse
import com.effyshopping.customer.mobile.core.presentation.EffyErrorState
import com.effyshopping.customer.mobile.core.presentation.EffySearchField
import com.effyshopping.customer.mobile.core.presentation.EffyLargeTitleBar
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
import com.effyshopping.mobile.kit.ui.EffyPullToRefresh
import com.effyshopping.customer.mobile.core.presentation.EffyRailTile
import com.effyshopping.customer.mobile.core.presentation.EffySectionHeader
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.customer.mobile.core.presentation.HomeSectionGap
import com.effyshopping.customer.mobile.core.presentation.RailItemGap
import com.effyshopping.customer.mobile.core.presentation.railTileWidthFraction
import com.effyshopping.customer.mobile.features.catalog.domain.Banner
import com.effyshopping.customer.mobile.features.catalog.domain.Rail
import com.effyshopping.customer.mobile.features.saved.presentation.SavedTileMessages
import com.effyshopping.customer.mobile.features.saved.presentation.SavedTiles
import com.effyshopping.customer.mobile.features.saved.presentation.TileSaveControl
import com.effyshopping.customer.mobile.features.saved.presentation.rememberSavedTiles
import com.effyshopping.customer.mobile.resources.Res
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
    /** 068: where the list chooser sends a guest who wants a named list. */
    onRequireSignIn: (() -> Unit)? = null,
    /** 087 (Main board): "All products" beside "Shop by aisle". */
    onAllProducts: () -> Unit = {},
    /** 087: the "Your Effy" shortcuts — the order in progress and the points balance. */
    onOpenOrder: (String) -> Unit = {},
    onPoints: () -> Unit = {},
) {
    val vm = viewModel { HomeViewModel(container.getHome, container.getCategories) }
    val state by vm.state.collectAsState()
    // 033 FR-007/FR-020: ONE membership read for the whole screen, however many rails it renders, and
    // one mirror every heart on it reads — so two rails carrying the same product cannot disagree.
    val savedTiles = rememberSavedTiles(container, onRequireSignIn)
    val tileCart = rememberTileCart(container)
    // 087 — the large title collapses as the page scrolls (App bar board, back=false).
    val collapse = rememberEffyCollapse()
    // 087 (Main board, "Your Effy") — signed-in only: the latest order still in progress, and points.
    // Both are best-effort reads; a failure simply leaves the card out (Home must never fail on them).
    val session by container.session.state.collectAsState()
    val signedIn = session is SessionState.Authenticated
    val yourEffy by produceState<YourEffy?>(null, signedIn) {
        value = if (!signedIn) null else YourEffy(
            order = runCatching { container.listOrders().firstOrNull { it.status !in setOf("delivered", "cancelled", "refunded", "failed", "pending_payment") } }.getOrNull(),
            points = runCatching { container.getPoints().first }.getOrNull(),
        ).takeIf { it.order != null || it.points != null }
    }

    Column(modifier = Modifier.fillMaxSize().background(EffySurface.page)) {
        // 087 (Main board): the wordmark and the bell, the light-blue search entry under them, no
        // border. The cart is a tab now and Saved is on Account, so the header carries nothing else.
        EffyLargeTitleBar(
            title = "Home",
            wordmark = true,
            collapse = collapse,
            search = {
                // An AFFORDANCE, not an input: one tap opens the Search tab with the keyboard up (028
                // FR-008). A second live field here would be the one without filters, sort or paging.
                EffySearchField(value = "", placeholder = "Search the store…", onEntryClick = onSearch)
            },
        )
        // Without this a refusal — the guest cap most of all — is silent, and a heart that flips
        // itself back looks like a bug rather than a limit.
        SavedTileMessages(savedTiles)

        when (val s = state) {
            HomeUiState.Loading -> EffyHomeSkeleton(Modifier.padding(top = EffySpacing.md))

            HomeUiState.Error -> EffyErrorState(
                title = "We couldn’t load the store",
                body = "Please try again in a moment.",
                onRetry = vm::load,
            )

            is HomeUiState.Ready -> {
                val blocks = remember(s.home, s.categories) { composeHome(s.home, s.categories) }

                if (blocks.isEmpty()) {
                    // SC-012: exactly ONE empty state. Never a stack of empty section headings.
                    EffyEmptyState(
                        title = "Nothing here yet",
                        body = "Our catalogue is on its way. Check back soon.",
                        icon = Res.drawable.lucide_shopping_basket,
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
                        HomeBlockList(
                            blocks, savedTiles, tileCart, collapse, onProductClick, onSeeAll, onCategoryClick, onBannerClick,
                            yourEffy = yourEffy, onAllProducts = onAllProducts, onOpenOrder = onOpenOrder, onPoints = onPoints,
                        )
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
    savedTiles: SavedTiles,
    tileCart: TileCart,
    collapse: EffyCollapseState,
    onProductClick: (String) -> Unit,
    onSeeAll: (Rail) -> Unit,
    onCategoryClick: (CategoryShortcut) -> Unit,
    onBannerClick: (Banner) -> Unit,
    yourEffy: YourEffy?,
    onAllProducts: () -> Unit,
    onOpenOrder: (String) -> Unit,
    onPoints: () -> Unit,
) {
    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val widthClass = widthClassFor(maxWidth)
        // ⚠ Resolved to a concrete Dp HERE, where the constraints are real. A LazyRow measures its
        // children with an unbounded main axis, so a fraction computed inside a rail item multiplies
        // infinity and bounds nothing (see EffyRailTile).
        val tileWidth = maxWidth * railTileWidthFraction(widthClass)

        LazyColumn(
            state = rememberLazyListState(),
            modifier = Modifier.fillMaxSize().nestedScroll(collapse.connection),
            verticalArrangement = Arrangement.spacedBy(HomeSectionGap),
            contentPadding = PaddingValues(top = EffySpacing.s, bottom = EffySpacing.xxxl),
        ) {
            // 087 (Main board): "Your Effy" sits under the hero — or first, when there is no hero.
            val heroFirst = blocks.firstOrNull() is HomeBlock.Offers
            if (yourEffy != null && !heroFirst) item(key = "your-effy") { YourEffyRow(yourEffy, onOpenOrder, onPoints) }
            items(blocks, key = { it.blockKey() }) { block ->
                when (block) {
                    is HomeBlock.Categories -> CategoryRow(block.items, onCategoryClick, onAllProducts)
                    is HomeBlock.Promo -> PromoBlock(block.banners, onBannerClick)
                    is HomeBlock.Offers -> Column(verticalArrangement = Arrangement.spacedBy(HomeSectionGap)) {
                        OffersSection(block.banners, onBannerClick)
                        if (yourEffy != null) YourEffyRow(yourEffy, onOpenOrder, onPoints)
                    }
                    is HomeBlock.Section -> SectionBlock(
                        rail = block.rail,
                        tileWidth = tileWidth,
                        savedTiles = savedTiles,
                        tileCart = tileCart,
                        onProductClick = onProductClick,
                        onSeeAll = { onSeeAll(block.rail) },
                    )
                }
            }
        }
    }
}

/**
 * THE HERO (Main board) — the store's current offers as a flat green panel at the top of Home, one per
 * page, swiped by hand (it never auto-advances: a shopper cannot pause a rotating carousel, Baymard).
 * One offer shows no dots. A bounded, NAMED group for a screen reader (FR-025).
 */
@Composable
private fun OffersSection(banners: List<Banner>, onBannerClick: (Banner) -> Unit) {
    if (banners.isEmpty()) return
    val pagerState = rememberPagerState(pageCount = { banners.size })
    HorizontalPager(
        state = pagerState,
        contentPadding = PaddingValues(horizontal = EffySpacing.lg),
        pageSpacing = EffySpacing.md,
        modifier = Modifier.semantics {
            isTraversalGroup = true
            contentDescription = "Offers, ${banners.size} available"
        },
    ) { page ->
        val banner = banners[page]
        EffyHeroBanner(
            eyebrow = if (page == 0) "This week's offer" else "Offer",
            title = banner.title,
            body = listOfNotNull(banner.subtitle, banner.code?.let { "Use code $it." }).joinToString(" ").ifBlank { null },
            icon = bannerIcon(banner),
            onClick = if (banner.target != null) ({ onBannerClick(banner) }) else null,
            dots = if (banners.size > 1) ({ HeroDots(banners.size, pagerState.currentPage) }) else null,
        )
    }
}

/** The hero's position dots, white on the green: the current one widens into a bar. */
@Composable
private fun HeroDots(count: Int, current: Int) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.semantics { contentDescription = "Offer ${current + 1} of $count" },
    ) {
        repeat(count) { index ->
            val selected = index == current
            val width by animateDpAsState(if (selected) 16.dp else 6.dp, tween(effyDuration(EffyStorefrontMotion.StandardMillis)), label = "heroDot")
            Box(
                Modifier
                    .height(6.dp)
                    .width(width)
                    .clip(CircleShape)
                    .background(androidx.compose.ui.graphics.Color.White.copy(alpha = if (selected) 1f else 0.5f)),
            )
        }
    }
}

/**
 * Promotions placed BETWEEN sections (028 US4) — on the Main board an "Offers" row of coloured cards
 * that scrolls sideways, alternating Effy blue and Effy green.
 */
@Composable
private fun PromoBlock(banners: List<Banner>, onBannerClick: (Banner) -> Unit) {
    if (banners.isEmpty()) return
    Column(modifier = Modifier.semantics { isTraversalGroup = true; contentDescription = "Offers, ${banners.size} available" }) {
        EffySectionHeader("Offers")
        LazyRow(
            modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.md),
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
            contentPadding = PaddingValues(horizontal = EffySpacing.lg),
        ) {
            itemsIndexed(banners, key = { _, b -> b.key }) { index, banner ->
                EffyOfferCard(
                    title = banner.title,
                    code = banner.code,
                    icon = bannerIcon(banner),
                    onClick = if (banner.target != null) ({ onBannerClick(banner) }) else null,
                    alternate = index % 2 == 1,
                )
            }
        }
    }
}

/** An offer's glyph: the aisle rule over its words (fruit → apple, dairy → milk), else a gift. */
private fun bannerIcon(banner: Banner) =
    categoryIcon("${banner.title} ${banner.subtitle.orEmpty()}").takeIf { it != CATEGORY_FALLBACK_ICON } ?: Res.drawable.lucide_gift

/** What "Your Effy" shows: the order in progress and the points balance, either or both. */
internal data class YourEffy(val order: OrderSummary?, val points: PointsBalance?)

/** "Your Effy" (Main board) — two small cards: the order on its way, and the points to spend. */
@Composable
private fun YourEffyRow(data: YourEffy, onOpenOrder: (String) -> Unit, onPoints: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().height(androidx.compose.foundation.layout.IntrinsicSize.Min).padding(horizontal = EffySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
    ) {
        data.order?.let { order ->
            EffyCard(modifier = Modifier.weight(1f).fillMaxHeight(), onClick = { onOpenOrder(order.id) }, padding = EffySpacing.md) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
                    Icon(painterResource(Res.drawable.lucide_truck), contentDescription = null, tint = EffyRoles.brand, modifier = Modifier.size(14.dp))
                    Text("Order ${order.orderNumber}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                }
                Text(
                    listOfNotNull(orderStageWord(order).first, orderArrivalLine(order)).joinToString(" · "),
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                    modifier = Modifier.padding(top = EffySpacing.xs),
                    maxLines = 3,
                )
            }
        }
        data.points?.let { points ->
            EffyCard(modifier = Modifier.weight(1f).fillMaxHeight(), onClick = onPoints, padding = EffySpacing.md) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
                    Icon(painterResource(Res.drawable.lucide_coins), contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(14.dp))
                    Text("Effy points", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(color = MaterialTheme.colorScheme.primary)) { append("${formatPoints(points.points)} pts") }
                        append(" · worth ${money(points.valueAmount, "AUD")}")
                    },
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                    modifier = Modifier.padding(top = EffySpacing.xs),
                )
            }
        }
    }
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
private fun CategoryRow(items: List<CategoryShortcut>, onCategoryClick: (CategoryShortcut) -> Unit, onAllProducts: () -> Unit) {
    // 087 (Main board): headed "Shop by aisle", with "All products" on the right.
    Column {
    EffySectionHeader("Shop by aisle", onSeeAll = onAllProducts, seeAllLabel = "All products")
    LazyRow(
        modifier = Modifier
            .fillMaxWidth()
            // FR-044: one bounded, named group — see SectionBlock for why isTraversalGroup is the
            // load-bearing half of this.
            .semantics {
                isTraversalGroup = true
                contentDescription = "Categories, ${items.size} available"
            },
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
        contentPadding = PaddingValues(horizontal = EffySpacing.lg),
    ) {
        items(items, key = { it.key }) { shortcut ->
            EffyCategoryShortcut(
                label = shortcut.label,
                icon = categoryIcon("${shortcut.key} ${shortcut.label}"),
                onClick = { onCategoryClick(shortcut) },
            )
        }
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
    savedTiles: SavedTiles,
    tileCart: TileCart,
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
                // 033 FR-007: the heart on a rail tile. ⚠ Its own `toggleable` consumes the tap, so it
                // does not also fire the tile's navigation — a shopper saving from a rail must not be
                // thrown onto the product page for their trouble.
                EffyRailTile(
                    product,
                    onProductClick,
                    width = tileWidth,
                    imageOverlay = { TileSaveControl(product, savedTiles) },
                    cartQuantity = tileCart.quantityOf(product.id),
                    onCartQuantityChange = { tileCart.change(product, it) },
                )
            }
        }
    }
}

