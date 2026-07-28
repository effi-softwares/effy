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
import com.effyshopping.customer.mobile.resources.ic_favorite_outlined
import com.effyshopping.customer.mobile.resources.ic_favorite_selected
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.mobile.kit.ui.EffyTopBar
import androidx.compose.material3.Icon
import org.jetbrains.compose.resources.painterResource
import com.effyshopping.customer.mobile.core.presentation.ProductImage
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
) {
    val vm = viewModel(key = productId) {
        ProductDetailViewModel(
            productId = productId,
            getProductDetail = container.getProductDetail,
            guestCart = container.guestCart,
            saveFavorite = container.saveFavorite,
            removeFavorite = container.removeFavorite,
        )
    }
    val state by vm.state.collectAsState()
    val saved by vm.favoriteSaved.collectAsState()
    val justAdded by vm.justAdded.collectAsState()
    val signedIn = session is SessionState.Authenticated

    Column(modifier = Modifier.fillMaxSize()) {
        // 025 FR-030: a standard header, not a floating text link.
        EffyTopBar(
            title = "Product",
            onBack = onBack,
            backIcon = painterResource(Res.drawable.ic_arrow_back),
        )

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
                saved = saved,
                justAdded = justAdded,
                onAddToCart = vm::addToCart,
                onToggleFavorite = { if (signedIn) vm.toggleFavorite() else onRequireSignIn() },
                onProductClick = onProductClick,
            )
        }
    }
}

@Composable
private fun ProductBody(
    container: AppContainer,
    product: ProductDetail,
    saved: Boolean,
    justAdded: Boolean,
    onAddToCart: (Int) -> Unit,
    onToggleFavorite: () -> Unit,
    onProductClick: (String) -> Unit,
) {
    var qty by remember { mutableStateOf(1) }
    val card = product.card

    Column(modifier = Modifier.fillMaxSize()) {
    Column(
        modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(EffySpacing.lg),
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

        card.brand?.let { Text(it, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        Text(card.name, style = MaterialTheme.typography.headlineSmall)

        Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s), verticalAlignment = Alignment.Bottom) {
            Text(money(card.priceAmount, card.currency), style = MaterialTheme.typography.headlineSmall)
            card.compareAtAmount?.let {
                Text(
                    money(it, card.currency),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textDecoration = TextDecoration.LineThrough,
                )
            }
        }

        if (card.available) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
                QuantityStepper(qty = qty, onChange = { qty = it })
                Button(onClick = { onAddToCart(qty) }) { Text(if (justAdded) "Added" else "Add to cart") }
            }
        } else {
            Text(
                "This item is currently unavailable.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        // 025 FR-029: a real icon, not the "♥"/"♡" text glyphs this used to render. The label still
        // carries the state so the meaning survives grayscale and screen readers (FR-047/FR-045).
        OutlinedButton(onClick = onToggleFavorite) {
            Icon(
                painterResource(if (saved) Res.drawable.ic_favorite_selected else Res.drawable.ic_favorite_outlined),
                contentDescription = null,
                modifier = Modifier.size(18.dp),
            )
            Text(
                if (saved) "Saved" else "Save",
                modifier = Modifier.padding(start = EffySpacing.s),
            )
        }

        product.longDescription?.let {
            HorizontalDivider(modifier = Modifier.padding(vertical = EffySpacing.xs))
            Text("Description", style = MaterialTheme.typography.titleMedium)
            Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        if (product.attributes.isNotEmpty()) {
            HorizontalDivider(modifier = Modifier.padding(vertical = EffySpacing.xs))
            Text("Details", style = MaterialTheme.typography.titleMedium)
            product.attributes.forEach { group -> AttributeSection(group) }
        }

        // FR-026: more like this, from the product's own category. Omitted entirely when the category
        // yields nothing else — an empty rail is worse than no rail.
        RelatedProductsRail(container, product.categoryKey, card.id, onProductClick)
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
                    .background(MaterialTheme.colorScheme.surfaceVariant),
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
                                if (selected) MaterialTheme.colorScheme.primary
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
    val message = when {
        context == null -> "Set your delivery location to see delivery options."
        context!!.serviced == null -> "Checking delivery to ${context!!.postcode}…"
        context!!.serviced == true -> "Delivers to ${context!!.postcode}. Options and cost at checkout."
        else -> "We don’t deliver to ${context!!.postcode} yet — you can still add this to your cart."
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
    Surface(tonalElevation = 3.dp, shadowElevation = 8.dp) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom))
                .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
        ) {
            Text(priceLabel, style = MaterialTheme.typography.titleMedium)
            QuantityStepper(qty = qty, onChange = onQtyChange)
            Button(onClick = onAdd, modifier = Modifier.weight(1f)) {
                Text(if (justAdded) "Added" else "Add to cart")
            }
        }
    }
}

@Composable
private fun AttributeSection(group: AttributeGroup) {
    Column(modifier = Modifier.padding(top = EffySpacing.s), verticalArrangement = Arrangement.spacedBy(EffySpacing.xs)) {
        Text(group.groupLabel, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        group.items.forEach { item ->
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(item.label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(item.value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            }
        }
    }
}

@Composable
private fun QuantityStepper(qty: Int, onChange: (Int) -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(EffyRadius.sm)),
    ) {
        TextButton(onClick = { if (qty > 1) onChange(qty - 1) }, enabled = qty > 1) { Text("−") }
        Text("$qty", modifier = Modifier.width(28.dp), style = MaterialTheme.typography.titleMedium)
        TextButton(onClick = { if (qty < 99) onChange(qty + 1) }, enabled = qty < 99) { Text("+") }
    }
}

private fun money(amount: String, currency: String): String =
    if (currency == "AUD") "$$amount" else "$currency $amount"

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
