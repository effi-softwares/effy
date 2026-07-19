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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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

/**
 * The customer Home tab (019 US1). A merchandised, scrolling store: a promo banner, category chips, and
 * horizontally scrolling product rails — real catalog data from the hot path. GUEST-FIRST: no session
 * needed. Product tiles are the Principle V card exception (the industry-standard commerce pattern).
 *
 * [onProductClick] is wired to product-detail navigation by US2; here it is provided by the shell.
 * Product images load from the presigned S3 URL via Coil3 ([ProductImage]), falling back to a
 * first-letter placeholder while loading or when a product has no image.
 */
@Composable
fun HomeScreen(container: AppContainer, onProductClick: (String) -> Unit) {
    val vm = viewModel { HomeViewModel(container.getHome, container.getCategories) }
    val state by vm.state.collectAsState()

    when (val s = state) {
        HomeUiState.Loading -> CenterBox { CircularProgressIndicator() }
        HomeUiState.Error -> ErrorState(onRetry = vm::load)
        is HomeUiState.Ready ->
            if (s.home.rails.isEmpty()) EmptyStore() else HomeList(s.home, s.categories, onProductClick)
    }
}

@Composable
private fun HomeList(home: com.effyshopping.customer.mobile.features.catalog.domain.HomeContent, categories: List<Category>, onProductClick: (String) -> Unit) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        home.banners.firstOrNull()?.let { banner ->
            item { BannerHero(banner) }
        }
        if (categories.isNotEmpty()) {
            item { CategoryChipsRow(categories) }
        }
        items(home.rails, key = { it.key }) { rail ->
            RailRow(rail, onProductClick)
        }
    }
}

@Composable
private fun BannerHero(banner: Banner) {
    Surface(
        color = MaterialTheme.colorScheme.primary,
        contentColor = MaterialTheme.colorScheme.onPrimary,
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
    ) {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(banner.title, style = MaterialTheme.typography.headlineSmall)
            banner.subtitle?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun CategoryChipsRow(categories: List<Category>) {
    LazyRow(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
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
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            rail.title,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(horizontal = 16.dp),
        )
        LazyRow(
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
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
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp)),
            contentAlignment = Alignment.Center,
        ) {
            ProductImage(product.imageUrl, product.name, modifier = Modifier.fillMaxSize())
            if (product.badges.isNotEmpty()) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(8.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
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
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
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
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
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

@Composable
private fun EmptyStore() {
    CenterBox {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
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
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
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
