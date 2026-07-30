package com.effyshopping.customer.mobile.features.cart.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.IconButton
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.core.presentation.DisplaySize
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyButtonShape
import com.effyshopping.customer.mobile.core.presentation.EffyDetailRow
import com.effyshopping.customer.mobile.core.presentation.EffyEmptyState
import com.effyshopping.customer.mobile.core.presentation.EffyHairline
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.customer.mobile.core.presentation.EffyDisplay
import com.effyshopping.customer.mobile.core.presentation.EffyQuantityStepper
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.customer.mobile.core.presentation.ProductImage
import com.effyshopping.customer.mobile.core.presentation.money
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_cart_outlined
import com.effyshopping.mobile.design.EffyRadius
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.mobile.kit.ui.EffyTopBar
import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartLine
import com.effyshopping.customer.mobile.features.cart.domain.packagesOf

/**
 * The cart (019 US3 / 021 US1). ONE unified Effy cart the customer pays for once — but the items are
 * grouped into ANONYMOUS packages (021 FR-005a): "Package 1", "Package 2", one per fulfilling shop, shown
 * with NO shop name, location, price, or window (SC-006). A single package shows no ordinal header
 * (graceful single-part, SC-011). Prices/windows appear only at the delivery step once an address exists.
 */
@Composable
fun CartScreen(container: AppContainer, onCheckout: () -> Unit, onBrowse: () -> Unit = {}) {
    val cart by container.cart.state.collectAsState()
    val lines = cart.lines
    val snackbarHost = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    // Re-price on open (027 FR-004). A cart restored from disk after a force-quit must show TODAY's prices
    // and availability, not the ones it was built from — for a guest (priced by `/v1/cart/preview`) exactly
    // as for a signed-in shopper (whose account cart is the truth). A failure here changes nothing: the
    // mirror stays, because "we could not check" must never read as "you have nothing".
    LaunchedEffect(Unit) { container.syncCart() }

    /** Remove with UNDO (025 FR-041) — removing the wrong line is a one-tap mistake. */
    fun onRemoved(line: GuestCartLine) {
        scope.launch {
            val result = snackbarHost.showSnackbar(
                message = "Removed ${line.name}",
                actionLabel = "Undo", // at most ONE action (FR-034)
                duration = SnackbarDuration.Short,
            )
            if (result == SnackbarResult.ActionPerformed) {
                // Restores the line the shopper had. 027: the PRICE it comes back at is whatever the
                // platform says on the next re-price — an undo restores a decision, not a price.
                container.addToCart(line)
            }
        }
    }

    if (lines.isEmpty()) {
        // FR-044: an empty cart offers a route back into the catalogue, not a dead end.
        // 026: the source's own empty-cart screen — app bar, centred icon, headline, explanation,
        // one action — via the shared [EffyEmptyState] so cart, favourites and orders cannot drift.
        Column(modifier = Modifier.fillMaxSize()) {
            EffyAppBar(title = "My Cart")
            EffyEmptyState(
                title = "Your Cart Is Empty!",
                body = "When you add products, they’ll appear here.",
                icon = Res.drawable.ic_cart_outlined,
                actionLabel = "Start shopping",
                onAction = onBrowse,
            )
        }
        return
    }

    // 027: the totals come from the MIRROR, which carries the platform's own figures — so an unavailable
    // line is already excluded (FR-022) rather than being silently added up here. Before this the screen
    // recomputed from the raw lines and would have charged the shopper's eye for something they cannot buy.
    val currency = cart.currency.ifBlank { lines.first().currency }
    val packages = packagesOf(lines)
    val multiPackage = packages.size > 1

    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = "My Cart")
        SnackbarHost(hostState = snackbarHost)
        LazyColumn(modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = EffySpacing.lg)) {
            if (multiPackage) {
                item(key = "split-note") {
                    Text(
                        "Your order arrives in ${packages.size} packages.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 12.dp, bottom = 4.dp),
                    )
                }
            }
            packages.forEach { pkg ->
                if (multiPackage) {
                    item(key = "hdr-${pkg.packageKey.ifBlank { "p${pkg.index}" }}") {
                        Text(
                            "Package ${pkg.index}",
                            style = MaterialTheme.typography.titleSmall,
                            modifier = Modifier.padding(top = 14.dp, bottom = 2.dp),
                        )
                    }
                }
                items(pkg.lines, key = { it.productId }) { line ->
                    CartRow(line, container, ::onRemoved)
                    HorizontalDivider()
                }
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Column(
            modifier = Modifier.padding(EffySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(EffySpacing.s),
        ) {
            // The source's order summary: label/value rows with the total emphasised.
            EffyDetailRow("Sub-total", money(cart.itemSubtotalAmount, currency))
            Text(
                "Delivery is calculated at checkout once you choose an address.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            EffyHairline(modifier = Modifier.padding(vertical = EffySpacing.s))
            EffyDetailRow("Total", money(cart.grandTotalAmount, currency), emphasised = true)
            EffyPrimaryButton("Go To Checkout", onClick = onCheckout)
            Text(
                "You’ll sign in at checkout. Your cart is kept.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * One cart line (025 FR-035).
 *
 * ⚠ The image is the change worth noting: this row used to be text only, so a shopper reviewing their
 * cart had to read product names to recognise what they had picked. Every comparable store shows the
 * thing you are buying, and `imageUrl` was already on the line — captured at add time.
 */
@Composable
private fun CartRow(line: GuestCartLine, container: AppContainer, onRemoved: (GuestCartLine) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = EffySpacing.md),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
    ) {
        Box(
            modifier = Modifier
                .size(88.dp)
                .clip(RoundedCornerShape(EffyRadius.md))
                .background(EffySurface.tint),
        ) {
            ProductImage(line.imageUrl, line.name, modifier = Modifier.fillMaxSize())
        }

        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(EffySpacing.xs)) {
            Text(
                line.name,
                style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
            )
            Text(
                money(line.unitPriceAmount, line.currency) + " each",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
            ) {
                EffyQuantityStepper(
                    quantity = line.quantity,
                    onChange = { container.setCartQuantity(line.productId, it) },
                )
                TextButton(onClick = {
                    container.removeFromCart(line.productId)
                    onRemoved(line)
                }) { Text("Remove") }
            }
        }

        Text(
            money(lineTotal(line), line.currency),
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
        )
    }
}

private fun lineTotal(line: GuestCartLine): String {
    val unit = line.unitPriceAmount.toDoubleOrNull() ?: 0.0
    val total = unit * line.quantity
    val cents = kotlin.math.round(total * 100).toLong()
    return "${cents / 100}.${(cents % 100).toString().padStart(2, '0')}"
}

@Composable
private fun SummaryRow(label: String, value: String, bold: Boolean = false) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(
            label,
            style = if (bold) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium,
            color = if (bold) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(value, style = if (bold) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium)
    }
}
