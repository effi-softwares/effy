package com.effyshopping.customer.mobile.features.catalog.presentation

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
import com.effyshopping.customer.mobile.features.cart.presentation.CartAction
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.features.delivery.formatPlace
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_arrow_back
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.mobile.kit.ui.EffyTopBar
import androidx.compose.material3.Icon
import org.jetbrains.compose.resources.painterResource
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.features.saved.presentation.SaveControl
import kotlinx.coroutines.launch
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.customer.mobile.core.presentation.EffyHairline
import com.effyshopping.customer.mobile.core.presentation.DiscountChip
import com.effyshopping.customer.mobile.core.presentation.DisplaySize
import com.effyshopping.customer.mobile.core.presentation.EffyButtonShape
import com.effyshopping.customer.mobile.core.presentation.EffyDisplay
import com.effyshopping.customer.mobile.core.presentation.EffyPullToRefresh
import com.effyshopping.customer.mobile.core.presentation.EffyQuantityStepper
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.customer.mobile.core.presentation.ProductImage
import com.effyshopping.customer.mobile.core.presentation.discountPercent
import com.effyshopping.customer.mobile.core.presentation.money
import com.effyshopping.customer.mobile.core.session.SessionState
import com.effyshopping.customer.mobile.features.catalog.domain.AttributeGroup
import com.effyshopping.customer.mobile.features.catalog.domain.ProductDetail

/**
 * Product detail (019 US2). Gallery placeholder, price + sale, description, and attributes as SECTIONED
 * DETAIL ROWS (never cards — DOCTRINE-2). Add-to-cart writes to the device-local guest cart; Save gates
 * a guest through deferred sign-in ([onRequireSignIn]) then favorites via the hot path.
 */
@Composable
fun ProductDetailScreen(
    container: AppContainer,
    productId: String,
    session: SessionState,
    onRequireSignIn: () -> Unit,
    onBack: () -> Unit,
    onProductClick: (String) -> Unit = {},
    onCart: () -> Unit = {},
) {
    val vm = viewModel(key = productId) {
        ProductDetailViewModel(
            productId = productId,
            getProductDetail = container.getProductDetail,
            addToCart = container.addToCart,
        )
    }
    val state by vm.state.collectAsState()
    val justAdded by vm.justAdded.collectAsState()
    // ⚠ THE FIX THIS WHOLE SLICE EXISTS FOR. The predecessor initialised a local
    // MutableStateFlow(false) here and nothing ever seeded it, so an already-saved product showed
    // an empty heart: the first tap was a no-op PUT and the SECOND silently un-saved it. Reading
    // the shared mirror means the control tells the truth on first render (FR-019).
    val savedIds by container.savedStore.saved.collectAsState()
    val scope = rememberCoroutineScope()
    val signedIn = session is SessionState.Authenticated

    Column(modifier = Modifier.fillMaxSize()) {
        // 025 FR-030: a standard header, not a floating text link.
        EffyAppBar(title = "Details", onBack = onBack, trailing = { CartAction(container, onCart) })

        when (val s = state) {
            ProductDetailUiState.Loading ->
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }

            ProductDetailUiState.Error ->
                Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
                        Text("We couldn’t load this product", style = MaterialTheme.typography.titleMedium)
                        Button(onClick = vm::load) { Text("Try again") }
                    }
                }

            is ProductDetailUiState.Ready -> ProductBody(
                container = container,
                product = s.product,
                justAdded = justAdded,
                saved = s.product.card.id in savedIds,
                onToggleSaved = { wanted ->
                    // ⚠ The price travels with the tap so a GUEST's device records the baseline they
                    // actually saw. Without it the merge would fall back to the price at sign-in time
                    // and the shopper would silently lose whatever drop they had been watching for.
                    scope.launch {
                        runCatching {
                            container.toggleSaved(
                                s.product.card.id, wanted,
                                s.product.card.priceAmount, s.product.card.currency,
                            )
                        }
                    }
                },
                onAddToCart = vm::addToCart,
                onRefresh = vm::refresh,
                onProductClick = onProductClick,
            )
        }
    }
}

@Composable
private fun ProductBody(
    container: AppContainer,
    product: ProductDetail,
    justAdded: Boolean,
    saved: Boolean,
    onToggleSaved: (Boolean) -> Unit,
    onAddToCart: (Int) -> Unit,
    onProductClick: (String) -> Unit,
    onRefresh: suspend () -> Unit,
) {
    var qty by remember { mutableStateOf(1) }
    val card = product.card

    Column(modifier = Modifier.fillMaxSize()) {
    EffyPullToRefresh(onRefresh = onRefresh, modifier = Modifier.weight(1f).fillMaxWidth()) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(EffySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
    ) {
        if (product.categoryPath.isNotEmpty()) {
            Text(
                product.categoryPath.joinToString(" › "),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        ProductGallery(product, card.name)

        card.brand?.let {
            Text(it, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        EffyDisplay(card.name, size = DisplaySize.Sub)

        // The price block matches the web product page: the charged price largest, the compare-at
        // struck through and SMALLER, and the saving stated as a percentage chip rather than left
        // for the shopper to compute.
        val percentOff = discountPercent(card.priceAmount, card.compareAtAmount)
        Row(
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                money(card.priceAmount, card.currency),
                style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.SemiBold),
            )
            if (percentOff != null && card.compareAtAmount != null) {
                Text(
                    money(card.compareAtAmount, card.currency),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textDecoration = TextDecoration.LineThrough,
                )
                DiscountChip(percentOff)
            }
        }

        // ⚠ There is exactly ONE add-to-cart affordance, and it is the sticky [BuyBar] below. An
        // inline stepper + button used to sit here as well, so an available product rendered two
        // quantity steppers and two add buttons a few dp apart — two controls over one piece of
        // state, which is a bug however consistent they stay.
        if (!card.available) {
            // A tinted notice, matching the web's unavailable panel — not a bare grey sentence that
            // reads as a caption rather than as the reason the buy button is missing.
            Text(
                "Currently unavailable. Browse the rest of the store while we restock.",
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(EffyRadius.md))
                    .background(EffySurface.tint)
                    .padding(EffySpacing.lg),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        // 033: the heart. A real icon toggle, never the "♥"/"♡" text glyphs 025 removed and
        // mobile-guard now fails the build on. Its accessible NAME is stable and the state travels
        // separately, so a screen reader hears one control whose state changed (FR-058).
        SaveControl(saved = saved, onToggle = onToggleSaved)

        product.longDescription?.let {
            HorizontalDivider(
                modifier = Modifier.padding(vertical = EffySpacing.lg),
                color = MaterialTheme.colorScheme.outlineVariant,
            )
            EffyDisplay("Description", size = DisplaySize.Sub)
            Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        if (product.attributes.isNotEmpty()) {
            HorizontalDivider(
                modifier = Modifier.padding(vertical = EffySpacing.lg),
                color = MaterialTheme.colorScheme.outlineVariant,
            )
            EffyDisplay("Details", size = DisplaySize.Sub)
            product.attributes.forEach { group -> AttributeSection(group) }
        }

        // FR-026: more like this, from the product's own category. Omitted entirely when the category
        // yields nothing else — an empty rail is worse than no rail.
        RelatedProductsRail(container, product.categoryKey, card.id, onProductClick)
    }
    }

    // ⚠ FR-025: the price and the add action stay reachable however far the shopper scrolls. On a
    // long product page the primary action used to scroll away entirely, so deciding to buy meant
    // scrolling back up to act on the decision.
    if (card.available) {
        BuyBar(
            priceLabel = money(card.priceAmount, card.currency),
            qty = qty,
            onQtyChange = { qty = it },
            justAdded = justAdded,
            onAdd = { onAddToCart(qty) },
        )
    }
    }
}

/** Swipeable gallery with position indication (FR-022). One image shows no dots. */
@Composable
private fun ProductGallery(product: ProductDetail, name: String) {
    val urls = product.gallery.map { it.imageUrl }.ifEmpty { listOfNotNull(product.card.imageUrl) }
    if (urls.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxWidth().aspectRatio(1f)
                .clip(RoundedCornerShape(EffyRadius.md))
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) { Text("No image", style = MaterialTheme.typography.bodyMedium) }
        return
    }

    val pagerState = rememberPagerState(pageCount = { urls.size })
    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
        HorizontalPager(state = pagerState, userScrollEnabled = urls.size > 1) { page ->
            Box(
                modifier = Modifier.fillMaxWidth().aspectRatio(1f)
                    .clip(RoundedCornerShape(EffyRadius.md))
                    .background(EffySurface.tint),
            ) {
                ProductImage(urls[page], name, modifier = Modifier.fillMaxSize())
            }
        }
        if (urls.size > 1) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
            ) {
                repeat(urls.size) { index ->
                    val selected = pagerState.currentPage == index
                    Box(
                        modifier = Modifier
                            .padding(horizontal = EffySpacing.xs)
                            .size(if (selected) 8.dp else 6.dp)
                            .clip(CircleShape)
                            .background(
                                if (selected) MaterialTheme.colorScheme.onSurface
                                else MaterialTheme.colorScheme.outlineVariant,
                            ),
                    )
                }
            }
        }
    }
}

/** The delivery expectation (FR-023) — serviceability only, never a fee or window (FR-014a). */
@Composable
private fun DeliveryExpectation(container: AppContainer) {
    val context by container.deliveryContext.state.collectAsState()
    // ⚠ `formatPlace`, not the bare postcode — the SAME rule the Home affordance and the sheet use
    // (030 FR-033). A shopper who sees "Melbourne VIC 3000" in the header and "3000" here has to work
    // out for themselves that those are the same place, and that is exactly what SC-008 asks a tester.
    val message = when (val ctx = context) {
        null -> "Set your delivery location to see delivery options."
        else -> when (ctx.serviced) {
            null -> "Checking delivery to ${formatPlace(ctx)}…"
            true -> "Delivers to ${formatPlace(ctx)}. Options and cost at checkout."
            false -> "We don’t deliver to ${formatPlace(ctx)} yet — you can still add this to your cart."
        }
    }
    Text(
        message,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

/** The persistent buy affordance (FR-025). */
@Composable
private fun BuyBar(
    priceLabel: String,
    qty: Int,
    onQtyChange: (Int) -> Unit,
    justAdded: Boolean,
    onAdd: () -> Unit,
) {
    // 026: the source's sticky buy bar — a hairline above, a labelled "Price" stack on the left, and
    // the primary action on the right. The old bar crowded price + stepper + button onto one line, so
    // on a narrow phone the button shrank to fit and stopped reading as the primary action.
    Column {
        EffyHairline(modifier = Modifier.padding(horizontal = 0.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(EffySurface.page)
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom))
                .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.lg),
        ) {
            Column {
                Text(
                    "Price",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(priceLabel, style = MaterialTheme.typography.titleLarge)
            }
            EffyQuantityStepper(quantity = qty, onChange = onQtyChange)
            EffyPrimaryButton(
                if (justAdded) "Added" else "Add to Cart",
                onClick = onAdd,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun AttributeSection(group: AttributeGroup) {
    Column(modifier = Modifier.padding(top = EffySpacing.s), verticalArrangement = Arrangement.spacedBy(EffySpacing.xs)) {
        Text(group.groupLabel, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        group.items.forEach { item ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = EffySpacing.s),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(item.label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(item.value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            }
            // The web sets each label/value pair on its own ruled row; without the rule a long
            // specifics table becomes two columns of text with no reading line between them.
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
    }
}

/**
 * "More like this" (025 FR-026).
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

    HorizontalDivider(modifier = Modifier.padding(vertical = EffySpacing.xs))
    Text("More like this", style = MaterialTheme.typography.titleMedium)
    LazyRow(horizontalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
        items(related, key = { it.id }) { product ->
            Column(
                modifier = Modifier.width(140.dp).clickable { onProductClick(product.id) },
                verticalArrangement = Arrangement.spacedBy(EffySpacing.xs),
            ) {
                Box(
                    modifier = Modifier.fillMaxWidth().aspectRatio(1f)
                        .clip(RoundedCornerShape(EffyRadius.sm))
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                ) {
                    ProductImage(product.imageUrl, product.name, modifier = Modifier.fillMaxSize())
                }
                Text(
                    product.name,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    money(product.priceAmount, product.currency),
                    style = MaterialTheme.typography.labelLarge,
                )
            }
        }
    }
}
