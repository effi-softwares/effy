package com.effyshopping.customer.mobile.features.catalog.presentation

import com.effyshopping.customer.mobile.core.observability.AnalyticsEvent
import com.effyshopping.customer.mobile.core.presentation.UnitPriceText
import com.effyshopping.customer.mobile.core.presentation.VariantChips
import com.effyshopping.customer.mobile.features.catalog.domain.Variant
import com.effyshopping.customer.mobile.features.catalog.domain.VariantSelection
import org.jetbrains.compose.resources.DrawableResource
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.runtime.produceState
import com.effyshopping.customer.mobile.resources.lucide_shopping_cart
import com.effyshopping.customer.mobile.resources.lucide_coins
import com.effyshopping.customer.mobile.resources.lucide_truck
import com.effyshopping.customer.mobile.resources.lucide_list_plus
import com.effyshopping.customer.mobile.resources.ic_favorite_selected
import com.effyshopping.customer.mobile.resources.lucide_heart
import com.effyshopping.customer.mobile.resources.lucide_circle_check
import com.effyshopping.customer.mobile.features.catalog.domain.ProductBadge
import com.effyshopping.customer.mobile.features.checkout.presentation.addAmounts
import com.effyshopping.customer.mobile.features.points.presentation.formatPoints
import com.effyshopping.customer.mobile.features.points.domain.PointsBalance
import com.effyshopping.customer.mobile.features.addresses.domain.SavedAddress
import com.effyshopping.customer.mobile.core.delivery.Coverage
import com.effyshopping.customer.mobile.core.delivery.CoverageWords
import com.effyshopping.customer.mobile.core.theme.EffyRoles
import com.effyshopping.customer.mobile.core.presentation.effyBump
import com.effyshopping.customer.mobile.core.presentation.EffyGroupDivider
import com.effyshopping.customer.mobile.core.presentation.EffyGroup
import com.effyshopping.customer.mobile.core.presentation.EffySecondaryButton
import com.effyshopping.customer.mobile.core.presentation.EffySaleBadge
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.AnimatedContent
import com.effyshopping.customer.mobile.resources.lucide_check
import com.effyshopping.customer.mobile.resources.lucide_info
import com.effyshopping.customer.mobile.features.cart.presentation.rememberTileCart
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import com.effyshopping.customer.mobile.core.presentation.effyDuration
import com.effyshopping.customer.mobile.core.presentation.EffyStorefrontMotion
import com.effyshopping.customer.mobile.core.presentation.RailItemGap
import com.effyshopping.customer.mobile.core.presentation.EffyRailTile
import com.effyshopping.customer.mobile.core.presentation.EffyHaptics
import com.effyshopping.customer.mobile.core.presentation.EffyPinnedBar
import com.effyshopping.customer.mobile.core.presentation.EffyTextLink
import com.effyshopping.customer.mobile.core.presentation.EffyNotice
import com.effyshopping.customer.mobile.core.presentation.effySharedElement
import com.effyshopping.customer.mobile.core.presentation.EffyErrorState
import com.effyshopping.customer.mobile.core.presentation.EffySkeletonBlock
import com.effyshopping.customer.mobile.features.saved.domain.ToggleOutcome
import com.effyshopping.customer.mobile.features.saved.presentation.ListChooserSheet
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.text.style.TextOverflow
import com.effyshopping.customer.mobile.features.catalog.domain.ProductCard
import com.effyshopping.mobile.design.EffyRadius
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_arrow_back
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.mobile.kit.ui.EffyTopBar
import androidx.compose.material3.Icon
import org.jetbrains.compose.resources.painterResource
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.features.saved.presentation.SaveControl
import kotlinx.coroutines.launch
import com.effyshopping.customer.mobile.features.saved.presentation.SaveControl
import kotlinx.coroutines.launch
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.customer.mobile.core.presentation.EffyHairline
import com.effyshopping.customer.mobile.core.presentation.DiscountChip
import com.effyshopping.customer.mobile.core.presentation.DisplaySize
import com.effyshopping.customer.mobile.core.presentation.EffyButtonShape
import com.effyshopping.customer.mobile.core.nav.CustomerNavKey
import com.effyshopping.customer.mobile.core.presentation.EffyDisplay
import com.effyshopping.customer.mobile.features.legal.presentation.LegalLinksText
import com.effyshopping.mobile.kit.ui.EffyPullToRefresh
import com.effyshopping.customer.mobile.core.presentation.EffyQuantityStepper
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.customer.mobile.core.presentation.ProductImage
import com.effyshopping.customer.mobile.core.presentation.discountPercent
import com.effyshopping.customer.mobile.core.presentation.money
import com.effyshopping.customer.mobile.core.session.SessionState
import com.effyshopping.customer.mobile.core.presentation.AgeBadge
import com.effyshopping.customer.mobile.features.catalog.domain.ProductDetail

/**
 * Product detail. Gallery placeholder, price + sale, description, and attributes as sectioned
 * detail rows (never cards — doctrine-2). Add-to-cart writes to the device-local guest cart; Save gates
 * a guest through deferred sign-in ([onRequireSignIn]) then favorites via the commerce service.
 */
@Composable
fun ProductDetailScreen(
    container: AppContainer,
    productId: String,
    /** The size to open on (a filtered result's); null = the product's default. */
    variantId: String? = null,
    session: SessionState,
    onRequireSignIn: () -> Unit,
    onBack: () -> Unit,
    onProductClick: (String) -> Unit = {},
    onCart: () -> Unit = {},
) {
    val vm = viewModel(key = productId) {
        ProductDetailViewModel(
            productId = productId,
            requestedVariantId = variantId,
            getProductDetail = container.getProductDetail,
            addToCart = container.addToCart,
        )
    }
    val state by vm.state.collectAsState()
    val justAdded by vm.justAdded.collectAsState()
    // The fix this whole slice exists for. The predecessor initialised a local
    // MutableStateFlow(false) here and nothing ever seeded it, so an already-saved product showed
    // an empty heart: the first tap was a no-op PUT and the second silently un-saved it. Reading
    // the shared mirror means the control tells the truth on first render.
    val savedIds by container.savedStore.saved.collectAsState()
    val scope = rememberCoroutineScope()
    // The list chooser for this product, opened from "Add to list" or from a filled heart on a
    // product that is in a named list.
    var choosingLists by remember { mutableStateOf(false) }
    val signedIn = session is SessionState.Authenticated

    Column(modifier = Modifier.fillMaxSize()) {
        // A standard header, not a floating text link.
        // 087 (Product board): the bar names the product once it is known.
        EffyAppBar(title = (state as? ProductDetailUiState.Ready)?.product?.card?.name ?: "", onBack = onBack)

        when (val s = state) {
            // A skeleton in the page's shape (it was a bare spinner), and the kit's error state.
            ProductDetailUiState.Loading -> Column(Modifier.padding(EffySpacing.lg), verticalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
                EffySkeletonBlock(Modifier.fillMaxWidth().aspectRatio(1f).effySharedElement("product-image-$productId"), radius = EffyStorefrontShape.lg)
                EffySkeletonBlock(Modifier.fillMaxWidth(0.4f).height(14.dp), radius = EffyStorefrontShape.sm)
                EffySkeletonBlock(Modifier.fillMaxWidth(0.8f).height(24.dp), radius = EffyStorefrontShape.sm)
                EffySkeletonBlock(Modifier.width(96.dp).height(32.dp), radius = EffyStorefrontShape.sm)
            }

            ProductDetailUiState.Error -> EffyErrorState(title = "We couldn’t load this product", onRetry = vm::load)

            is ProductDetailUiState.Ready -> ProductBody(
                container = container,
                product = s.product,
                selected = s.selected,
                onPickValue = { slot, valueId ->
                    vm.pickValue(slot, valueId)
                    (vm.state.value as? ProductDetailUiState.Ready)?.selected?.let {
                        container.analyticsDriver.capture(AnalyticsEvent.VariantSelected(productId, it.id))
                    }
                },
                justAdded = justAdded,
                saved = s.product.card.id in savedIds,
                onToggleSaved = { wanted ->
                    // The price travels with the tap so a guest's device records the baseline they
                    // actually saw. Without it the merge would fall back to the price at sign-in time
                    // and the shopper would silently lose whatever drop they had been watching for.
                    scope.launch {
                        val outcome = runCatching {
                            container.toggleSaved(
                                s.product.card.id, wanted,
                                s.selected?.priceAmount ?: s.product.card.priceAmount, s.product.card.currency,
                                // The size on screen is remembered with the save.
                                s.selected?.id,
                            )
                        }.getOrNull()
                        // In a list the shopper named, so the tap removed nothing.
                        if (outcome == ToggleOutcome.OPEN_CHOOSER) choosingLists = true
                    }
                },
                onAddToList = { choosingLists = true },
                onAddToCart = vm::addToCart,
                onRefresh = vm::refresh,
                onProductClick = onProductClick,
            )
        }
    }

    if (choosingLists) {
        ListChooserSheet(
            container = container,
            productId = productId,
            variantId = (state as? ProductDetailUiState.Ready)?.selected?.id,
            onDismiss = { choosingLists = false },
            onRequireSignIn = onRequireSignIn,
        )
    }
}

/** What the delivery & points card says — signed-in only, both best-effort reads. */
private data class ProductContext(val address: SavedAddress?, val points: PointsBalance?)

/**
 * The product page (Product board): gallery, the path and brand, name, price with the saving in Effy
 * green, availability, Save and Add to list side by side, a delivery & points card, the description,
 * an item-specifics table, the allergen card, and "More like this". The add action is pinned.
 */
@Composable
private fun ProductBody(
    container: AppContainer,
    product: ProductDetail,
    /** The one size the price, availability and add follow; null only for a product with none. */
    selected: Variant?,
    onPickValue: (slot: Int, valueId: String) -> Unit,
    justAdded: Boolean,
    saved: Boolean,
    onToggleSaved: (Boolean) -> Unit,
    onAddToList: () -> Unit,
    onAddToCart: (Int) -> Unit,
    onProductClick: (String) -> Unit,
    onRefresh: suspend () -> Unit,
) {
    var qty by remember { mutableStateOf(1) }
    // The card as the chosen size: its price, "was" price, availability and comparison price.
    val card = selected?.let {
        product.card.copy(priceAmount = it.priceAmount, compareAtAmount = it.compareAtAmount, available = it.available, unitPrice = it.unitPrice)
    } ?: product.card
    val session by container.session.state.collectAsState()
    val signedIn = session is SessionState.Authenticated
    val context by produceState(ProductContext(null, null), signedIn) {
        value = if (!signedIn) ProductContext(null, null) else ProductContext(
            address = runCatching { container.listSavedAddresses().let { list -> list.firstOrNull { it.isDefault } ?: list.firstOrNull() } }.getOrNull(),
            points = runCatching { container.getPoints().first }.getOrNull()?.takeIf { it.points > 0 },
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
    EffyPullToRefresh(onRefresh = onRefresh, modifier = Modifier.weight(1f).fillMaxWidth()) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(EffySpacing.lg),
    ) {
        ProductGallery(product, card.name)

        Spacer(Modifier.height(EffySpacing.lg))
        if (product.categoryPath.isNotEmpty()) {
            Text(product.categoryPath.joinToString(" › "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        card.brand?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp)) }
        Text(card.name, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(top = EffySpacing.xs))
        if (card.ageRestricted) AgeBadge(Modifier.padding(top = EffySpacing.s))

        // The price: what is charged largest, the old price struck, the saving as a green badge — and
        // said in words, so nobody has to do the sum.
        val percentOff = discountPercent(card.priceAmount, card.compareAtAmount)
        Row(
            modifier = Modifier.padding(top = EffySpacing.md),
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(money(card.priceAmount, card.currency), style = MaterialTheme.typography.displaySmall.copy(fontFeatureSettings = "tnum"))
            if (percentOff != null && card.compareAtAmount != null) {
                Text(
                    money(card.compareAtAmount, card.currency),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textDecoration = TextDecoration.LineThrough,
                )
                EffySaleBadge(text = "−$percentOff%")
            }
            // The offer the cart will apply to this product.
            if (card.offerLabel != null && card.available) EffySaleBadge(text = card.offerLabel)
        }
        UnitPriceText(card.unitPrice, modifier = Modifier.padding(top = 2.dp))
        Text(
            buildAnnotatedString {
                if (percentOff != null && card.compareAtAmount != null) {
                    withStyle(SpanStyle(color = EffyRoles.brand, fontWeight = FontWeight.SemiBold)) {
                        append("Save ${money(subtractAmounts(card.compareAtAmount, card.priceAmount), card.currency)} ($percentOff% off)")
                    }
                    append(" · ")
                }
                append("Price includes GST")
            },
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = EffySpacing.xs),
        )

        // Availability, in words with an icon (never colour alone).
        Spacer(Modifier.height(EffySpacing.md))
        if (card.available) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(painterResource(Res.drawable.lucide_circle_check), contentDescription = null, tint = EffyRoles.brand, modifier = Modifier.size(16.dp))
                Text("Available now", style = MaterialTheme.typography.bodyMedium, color = EffyRoles.brand)
            }
        } else if (product.options.isNotEmpty()) {
            EffyNotice("This size is sold out. Choose another, or save it for later.", icon = Res.drawable.lucide_info)
        } else {
            EffyNotice("Currently unavailable. Browse the rest of the store while we restock.", icon = Res.drawable.lucide_info)
        }

        // The size selector, only for a product sold in more than one way.
        if (selected != null) {
            VariantChips(
                rows = VariantSelection.rows(product.options, product.variants, selected),
                onPick = onPickValue,
                modifier = Modifier.padding(top = EffySpacing.lg),
            )
        }

        // Save and Add to list, side by side (Product board). The heart is filled and blue once saved.
        Row(modifier = Modifier.padding(top = EffySpacing.lg), horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
            EffySecondaryButton(
                if (saved) "Saved" else "Save",
                onClick = { onToggleSaved(!saved) },
                modifier = Modifier.weight(1f).effyBump(saved),
                leading = {
                    Icon(
                        painterResource(if (saved) Res.drawable.ic_favorite_selected else Res.drawable.lucide_heart),
                        contentDescription = null,
                        tint = if (saved) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.size(18.dp),
                    )
                },
            )
            // The labelled way into the list chooser.
            EffySecondaryButton(
                "Add to list",
                onClick = onAddToList,
                modifier = Modifier.weight(1f),
                leading = { Icon(painterResource(Res.drawable.lucide_list_plus), contentDescription = null, modifier = Modifier.size(18.dp)) },
            )
        }

        // Delivery & points (Product board) — only what is true for this shopper: who delivers to their
        // address in the pinned coverage words, and the points they hold. A guest sees neither.
        val address = context.address
        val coverageWords = address?.coverage?.let { CoverageWords.describe(it) }
        if (coverageWords != null || context.points != null) {
            EffyGroup(modifier = Modifier.padding(top = EffySpacing.lg)) {
                if (address != null && coverageWords != null) {
                    ProductInfoRow(
                        icon = Res.drawable.lucide_truck,
                        iconTint = if (address.coverage == Coverage.Effy) EffyRoles.brand else MaterialTheme.colorScheme.onSurfaceVariant,
                        title = buildAnnotatedString {
                            append(coverageWords)
                            if (address.coverage != Coverage.None) append(" to ${address.label?.takeIf { it.isNotBlank() } ?: address.city} · ${address.city} ${address.postalCode}")
                        },
                        body = when (address.coverage) {
                            Coverage.Effy -> "Choose a delivery window at checkout."
                            Coverage.Courier -> "The estimate is shown at checkout."
                            else -> null
                        },
                    )
                }
                context.points?.let { p ->
                    if (address != null && coverageWords != null) EffyGroupDivider()
                    ProductInfoRow(
                        icon = Res.drawable.lucide_coins,
                        iconTint = MaterialTheme.colorScheme.primary,
                        title = buildAnnotatedString {
                            append("You have ")
                            withStyle(SpanStyle(color = MaterialTheme.colorScheme.primary)) { append("${formatPoints(p.points)} Effy points") }
                            append(" (worth ${money(p.valueAmount, "AUD")})")
                        },
                        body = "Use them to pay at checkout.",
                    )
                }
            }
        }

        product.longDescription?.let {
            Text("Description", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = EffySpacing.xxxl))
            Text(it, style = MaterialTheme.typography.bodyLarge.copy(lineHeight = 26.sp), color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = EffySpacing.md))
        }

        // Item specifics — bordered two-column tables (Product board), one per section, the brand first. They
        // are the selected size's (101): a detail that differs by size (a flavour's allergens) follows the selector.
        val groups = (selected ?: product.variants.firstOrNull())?.details.orEmpty()
        val sections = buildList {
            val brand = card.brand?.let { listOf("Brand" to it) }.orEmpty()
            if (groups.isEmpty()) {
                if (brand.isNotEmpty()) add("Item specifics" to brand)
            } else {
                groups.forEachIndexed { i, g ->
                    val rows = g.items.map { it.label to it.value }
                    add((if (groups.size == 1) "Item specifics" else g.groupLabel) to (if (i == 0) brand + rows else rows))
                }
            }
        }
        sections.forEach { (title, rows) ->
            Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = EffySpacing.xxxl, bottom = EffySpacing.md))
            EffyGroup {
                rows.forEachIndexed { index, (label, value) ->
                    Row(modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp).padding(horizontal = EffySpacing.md, vertical = EffySpacing.s), verticalAlignment = Alignment.CenterVertically) {
                        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                        Text(value, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                    }
                    if (index < rows.lastIndex) EffyGroupDivider()
                }
            }
        }

        // Allergens: the physical label is the authority; this points there (Product board card).
        Text("Allergens & safety", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = EffySpacing.xxxl, bottom = EffySpacing.md))
        EffyGroup {
            Row(modifier = Modifier.padding(EffySpacing.md), horizontalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
                Icon(painterResource(Res.drawable.lucide_info), contentDescription = null, modifier = Modifier.padding(top = 2.dp).size(18.dp))
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("Always read the label", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold))
                    LegalLinksText(
                        "Always check the product label for allergens and ingredients. See our " +
                            "[Food Safety & Allergen Notice](/legal/food-safety-allergens).",
                        onNavigateSlug = { container.navigator.push(CustomerNavKey.LegalDocument(it)) },
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }

        // More like this, from the product's own category; nothing at all when there is none.
        Spacer(Modifier.height(EffySpacing.xl))
        RelatedProductsRail(container, product.categoryKey, card.id, onProductClick)
        Spacer(Modifier.height(EffySpacing.lg))
    }
    }

    // The add action stays reachable however far the shopper scrolls.
    if (card.available) {
        BuyBar(
            unitPrice = card.priceAmount,
            currency = card.currency,
            qty = qty,
            onQtyChange = { qty = it },
            justAdded = justAdded,
            onAdd = { onAddToCart(qty) },
        )
    }
    }
}

/** One row of the delivery & points card: an icon, a line, and a muted second line. */
@Composable
private fun ProductInfoRow(icon: DrawableResource, iconTint: androidx.compose.ui.graphics.Color, title: androidx.compose.ui.text.AnnotatedString, body: String?) {
    Row(modifier = Modifier.fillMaxWidth().padding(EffySpacing.md), horizontalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
        Icon(painterResource(icon), contentDescription = null, tint = iconTint, modifier = Modifier.padding(top = 2.dp).size(20.dp))
        Column {
            Text(title, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium))
            body?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}

/** The gallery (Product board): a grey well, the Sale badge, "1 / 4" bottom-right, dots below. */
@Composable
private fun ProductGallery(product: ProductDetail, name: String) {
    val urls = product.gallery.map { it.imageUrl }.ifEmpty { listOfNotNull(product.card.imageUrl) }.ifEmpty { listOf(null) }
    val onSale = discountPercent(product.card.priceAmount, product.card.compareAtAmount) != null || product.card.badges.contains(ProductBadge.ON_SALE)
    val pagerState = rememberPagerState(pageCount = { urls.size })
    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
        Box {
            HorizontalPager(state = pagerState, userScrollEnabled = urls.size > 1) { page ->
                // The first picture is the shared element the tile's picture grows into.
                Box(
                    modifier = Modifier.fillMaxWidth().aspectRatio(1f)
                        .then(if (page == 0) Modifier.effySharedElement("product-image-${product.card.id}") else Modifier)
                        .clip(EffyStorefrontShape.card)
                        .background(EffySurface.tint),
                ) { ProductImage(urls[page], name, modifier = Modifier.fillMaxSize()) }
            }
            if (onSale) EffySaleBadge(modifier = Modifier.align(Alignment.TopStart).padding(EffySpacing.md))
            if (urls.size > 1) {
                Box(
                    modifier = Modifier.align(Alignment.BottomEnd).padding(EffySpacing.md)
                        .clip(EffyStorefrontShape.small)
                        .background(MaterialTheme.colorScheme.background)
                        .border(1.dp, MaterialTheme.colorScheme.outline, EffyStorefrontShape.small)
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                ) { Text("${pagerState.currentPage + 1} / ${urls.size}", style = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = "tnum")) }
            }
        }
        if (urls.size > 1) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                repeat(urls.size) { index ->
                    val selected = pagerState.currentPage == index
                    val w by animateDpAsState(if (selected) 16.dp else 6.dp, tween(effyDuration(EffyStorefrontMotion.StandardMillis)), label = "galleryDot")
                    Box(
                        modifier = Modifier
                            .padding(horizontal = 3.dp)
                            .height(6.dp)
                            .width(w)
                            .clip(CircleShape)
                            .background(if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline),
                    )
                }
            }
        }
    }
}

/**
 * The pinned buy bar (Product board): an outlined stepper, then "Add to cart · $total" for the chosen
 * quantity. "Added to cart" with a tick for two seconds after, and a light haptic.
 */
@Composable
private fun BuyBar(
    unitPrice: String,
    currency: String,
    qty: Int,
    onQtyChange: (Int) -> Unit,
    justAdded: Boolean,
    onAdd: () -> Unit,
) {
    val tick = EffyHaptics.tick()
    EffyPinnedBar {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
            Box(Modifier.border(1.dp, MaterialTheme.colorScheme.outline, EffyStorefrontShape.control)) {
                EffyQuantityStepper(quantity = qty, onChange = onQtyChange, outlined = true)
            }
            AnimatedContent(targetState = justAdded, modifier = Modifier.weight(1f), label = "addedLabel") { added ->
                EffyPrimaryButton(
                    if (added) "Added to cart" else "Add to cart · ${money(multiplyAmount(unitPrice, qty), currency)}",
                    onClick = { tick(); onAdd() },
                    leading = {
                        Icon(
                            painterResource(if (added) Res.drawable.lucide_check else Res.drawable.lucide_shopping_cart),
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier.size(18.dp),
                        )
                    },
                )
            }
        }
    }
}

/** "4.00" − "3.00" → "1.00", in whole cents. */
private fun subtractAmounts(a: String, b: String): String = addAmounts(a, "-$b")

/** "3.00" × 2 → "6.00", in whole cents. */
private fun multiplyAmount(unit: String, qty: Int): String {
    var total = "0.00"
    repeat(qty.coerceAtLeast(0)) { total = addAmounts(total, unit) }
    return total
}

/**
 * "More like this".
 *
 * Reuses the existing product search filtered by the product's own category — no recommendation
 * engine and no new relationship, because a category is the only relatedness the catalogue models.
 * Renders nothing at all when the category yields no other products.
 */
@Composable
private fun RelatedProductsRail(
    container: AppContainer,
    categoryKey: String,
    excludeProductId: String,
    onProductClick: (String) -> Unit,
) {
    var related by remember(categoryKey) { mutableStateOf<List<ProductCard>>(emptyList()) }

    LaunchedEffect(categoryKey, excludeProductId) {
        related = try {
            container.searchProducts(query = "", saleOnly = false, categoryKey = categoryKey)
                .items
                .filter { it.id != excludeProductId }
                .take(12)
        } catch (_: Throwable) {
            // A failed sidebar must never break the product page.
            emptyList()
        }
    }

    if (related.isEmpty()) return

    // The one product tile (the ad-hoc 140dp tile is gone), with its "+" so a shopper can add
    // a related product without leaving this page.
    val tileCart = rememberTileCart(container)
    Text("More like this", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = EffySpacing.lg))
    LazyRow(horizontalArrangement = Arrangement.spacedBy(RailItemGap)) {
        items(related, key = { it.id }) { product ->
            EffyRailTile(
                product,
                onProductClick,
                width = 160.dp,
                cartQuantity = tileCart.quantityOf(product.variantId),
                onCartQuantityChange = { tileCart.change(product, it) },
            )
        }
    }
}
