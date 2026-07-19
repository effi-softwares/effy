package com.effyshopping.customer.mobile.features.catalog.presentation

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
        TextButton(onClick = onBack, modifier = Modifier.padding(4.dp)) { Text("← Back") }

        when (val s = state) {
            ProductDetailUiState.Loading ->
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }

            ProductDetailUiState.Error ->
                Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("We couldn’t load this product", style = MaterialTheme.typography.titleMedium)
                        Button(onClick = vm::load) { Text("Try again") }
                    }
                }

            is ProductDetailUiState.Ready -> ProductBody(
                product = s.product,
                saved = saved,
                justAdded = justAdded,
                onAddToCart = vm::addToCart,
                onToggleFavorite = { if (signedIn) vm.toggleFavorite() else onRequireSignIn() },
            )
        }
    }
}

@Composable
private fun ProductBody(
    product: ProductDetail,
    saved: Boolean,
    justAdded: Boolean,
    onAddToCart: (Int) -> Unit,
    onToggleFavorite: () -> Unit,
) {
    var qty by remember { mutableStateOf(1) }
    val card = product.card

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (product.categoryPath.isNotEmpty()) {
            Text(
                product.categoryPath.joinToString(" › "),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        Box(
            modifier = Modifier.fillMaxWidth().aspectRatio(1f)
                .clip(RoundedCornerShape(16.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(16.dp)),
            contentAlignment = Alignment.Center,
        ) {
            val heroUrl = product.gallery.firstOrNull()?.imageUrl ?: card.imageUrl
            ProductImage(heroUrl, card.name, modifier = Modifier.fillMaxSize())
        }

        card.brand?.let { Text(it, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        Text(card.name, style = MaterialTheme.typography.headlineSmall)

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
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
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
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

        OutlinedButton(onClick = onToggleFavorite) { Text(if (saved) "♥ Saved" else "♡ Save") }

        product.longDescription?.let {
            HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
            Text("Description", style = MaterialTheme.typography.titleMedium)
            Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        if (product.attributes.isNotEmpty()) {
            HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
            Text("Details", style = MaterialTheme.typography.titleMedium)
            product.attributes.forEach { group -> AttributeSection(group) }
        }
    }
}

@Composable
private fun AttributeSection(group: AttributeGroup) {
    Column(modifier = Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
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
        modifier = Modifier.border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(8.dp)),
    ) {
        TextButton(onClick = { if (qty > 1) onChange(qty - 1) }, enabled = qty > 1) { Text("−") }
        Text("$qty", modifier = Modifier.width(28.dp), style = MaterialTheme.typography.titleMedium)
        TextButton(onClick = { if (qty < 99) onChange(qty + 1) }, enabled = qty < 99) { Text("+") }
    }
}

private fun money(amount: String, currency: String): String =
    if (currency == "AUD") "$$amount" else "$currency $amount"
