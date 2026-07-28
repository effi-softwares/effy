package com.effyshopping.customer.mobile.features.cart.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.IconButton
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.core.presentation.ProductImage
import com.effyshopping.mobile.design.EffyRadius
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.mobile.kit.ui.EffyTopBar
import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartLine
import com.effyshopping.customer.mobile.features.cart.domain.computeTotals
import com.effyshopping.customer.mobile.features.cart.domain.packagesOf

/**
 * The cart (019 US3 / 021 US1). ONE unified Effy cart the customer pays for once — but the items are
 * grouped into ANONYMOUS packages (021 FR-005a): "Package 1", "Package 2", one per fulfilling shop, shown
 * with NO shop name, location, price, or window (SC-006). A single package shows no ordinal header
 * (graceful single-part, SC-011). Prices/windows appear only at the delivery step once an address exists.
 */
@Composable
fun CartScreen(container: AppContainer, onCheckout: () -> Unit, onBrowse: () -> Unit = {}) {
    val lines by container.guestCart.lines.collectAsState()
    val snackbarHost = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    /** Remove with UNDO (025 FR-041) — removing the wrong line is a one-tap mistake. */
    fun onRemoved(line: GuestCartLine) {
        scope.launch {
            val result = snackbarHost.showSnackbar(
                message = "Removed ${line.name}",
                actionLabel = "Undo", // at most ONE action (FR-034)
                duration = SnackbarDuration.Short,
            )
            if (result == SnackbarResult.ActionPerformed) {
                // The line was snapshotted at add time, so restoring it restores exactly what the
                // shopper had — including the price they saw.
                container.guestCart.add(line)
            }
        }
    }

    if (lines.isEmpty()) {
        // FR-044: an empty cart offers a route back into the catalogue, not a dead end.
        Column(modifier = Modifier.fillMaxSize()) {
            EffyTopBar(title = "Cart")
            Column(
                modifier = Modifier.fillMaxSize().padding(EffySpacing.xxxl),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text("Your cart is empty", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Browse the store and add something you like.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(
                    onClick = onBrowse,
                    modifier = Modifier.padding(top = EffySpacing.lg),
                ) { Text("Start shopping") }
            }
        }
        return
    }

    val totals = computeTotals(lines)
    val currency = lines.first().currency
    val packages = packagesOf(lines)
    val multiPackage = packages.size > 1

    Column(modifier = Modifier.fillMaxSize()) {
        EffyTopBar(title = "Cart")
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
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            SummaryRow("Items", money(totals.itemSubtotal, currency), bold = true)
            Text(
                "Delivery is calculated at checkout once you choose an address.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Button(onClick = onCheckout, modifier = Modifier.fillMaxWidth()) { Text("Checkout") }
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
                .size(72.dp)
                .clip(RoundedCornerShape(EffyRadius.sm))
                .background(MaterialTheme.colorScheme.surfaceVariant),
        ) {
            ProductImage(line.imageUrl, line.name, modifier = Modifier.fillMaxSize())
        }

        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(EffySpacing.xs)) {
            Text(line.name, style = MaterialTheme.typography.bodyMedium)
            Text(
                money(line.unitPriceAmount, line.currency) + " each",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
            ) {
                QuantityStepper(
                    qty = line.quantity,
                    onChange = { container.guestCart.setQuantity(line.productId, it) },
                )
                TextButton(onClick = {
                    container.guestCart.remove(line.productId)
                    onRemoved(line)
                }) { Text("Remove") }
            }
        }

        Text(
            money(lineTotal(line), line.currency),
            style = MaterialTheme.typography.titleSmall,
        )
    }
}

/** A touch-target-sized stepper (FR-036) — the TextButton pair it replaced was visually weak. */
@Composable
private fun QuantityStepper(qty: Int, onChange: (Int) -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.border(
            1.dp,
            MaterialTheme.colorScheme.outlineVariant,
            RoundedCornerShape(EffyRadius.sm),
        ),
    ) {
        IconButton(onClick = { onChange(qty - 1) }, modifier = Modifier.size(40.dp)) {
            Text("−", style = MaterialTheme.typography.titleMedium)
        }
        Text(
            "$qty",
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.widthIn(min = 24.dp),
            textAlign = TextAlign.Center,
        )
        IconButton(
            onClick = { onChange(qty + 1) },
            enabled = qty < 99,
            modifier = Modifier.size(40.dp),
        ) {
            Text("+", style = MaterialTheme.typography.titleMedium)
        }
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

private fun money(amount: String, currency: String): String =
    if (currency == "AUD") "$$amount" else "$currency $amount"
