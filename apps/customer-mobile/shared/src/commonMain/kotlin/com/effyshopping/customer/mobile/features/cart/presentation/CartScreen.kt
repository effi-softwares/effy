package com.effyshopping.customer.mobile.features.cart.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.presentation.EffyConfirmSheet
import com.effyshopping.customer.mobile.core.presentation.EffyDetailRow
import com.effyshopping.customer.mobile.core.presentation.EffyEmptyState
import com.effyshopping.customer.mobile.core.presentation.EffyField
import com.effyshopping.customer.mobile.core.presentation.EffyGhostButton
import com.effyshopping.customer.mobile.core.presentation.EffyHairline
import com.effyshopping.customer.mobile.core.presentation.EffyInlineError
import com.effyshopping.customer.mobile.core.presentation.EffyLargeTitleBar
import com.effyshopping.customer.mobile.core.presentation.EffyNotice
import com.effyshopping.customer.mobile.core.presentation.EffyNumberRoll
import com.effyshopping.customer.mobile.core.presentation.EffyPinnedBar
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.customer.mobile.core.presentation.EffyQuantityStepper
import com.effyshopping.customer.mobile.core.presentation.EffySecondaryButton
import com.effyshopping.customer.mobile.core.presentation.EffySnackbarHost
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.customer.mobile.core.presentation.EffyTextLink
import com.effyshopping.customer.mobile.core.presentation.ProductImage
import com.effyshopping.customer.mobile.core.presentation.money
import com.effyshopping.customer.mobile.core.presentation.rememberEffyCollapse
import com.effyshopping.customer.mobile.core.session.SessionState
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import com.effyshopping.customer.mobile.features.cart.domain.CartBlockedReason
import com.effyshopping.customer.mobile.features.cart.domain.CartDiscount
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartLine
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.lucide_info
import com.effyshopping.customer.mobile.resources.lucide_shopping_cart
import com.effyshopping.customer.mobile.resources.lucide_tag
import com.effyshopping.customer.mobile.resources.lucide_trash_2
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.mobile.kit.ui.EffyPullToRefresh
import androidx.compose.ui.input.nestedscroll.nestedScroll
import kotlinx.coroutines.launch
import com.effyshopping.customer.mobile.core.presentation.EffyRailTile
import com.effyshopping.customer.mobile.features.points.presentation.formatPoints
import com.effyshopping.customer.mobile.features.points.domain.PointsBalance
import com.effyshopping.customer.mobile.features.catalog.domain.ProductCard
import com.effyshopping.customer.mobile.resources.lucide_coins
import androidx.compose.runtime.produceState
import androidx.compose.foundation.lazy.LazyRow
import com.effyshopping.customer.mobile.core.presentation.EffyMinTouchTarget
import androidx.compose.foundation.layout.heightIn

/**
 * THE CART TAB (Cart board; 087 — the cart is a tab, not a pushed page).
 *
 * One list of lines, an order summary, and a pinned bar with the total and "Go to checkout".
 *
 * ⚠ HIDDEN FULFILMENT (087 FR-031): the cart says NOTHING about how many suppliers or packages fill
 * the order. Until 087 it grouped lines under "Package 1 / Package 2" and said "Your order arrives in N
 * packages" — which tells a shopper how many shops are behind one brand. Lines are one list now;
 * `packageKey` stays on the line for the server and is never shown (`mobile-guard.sh` fails the words).
 */
@Composable
fun CartScreen(
    container: AppContainer,
    onCheckout: () -> Unit,
    onBrowse: () -> Unit = {},
    /** 087 (Cart board) — the "On sale now" rail. */
    onProductClick: (String) -> Unit = {},
    onSeeAllSale: () -> Unit = {},
) {
    val cart by container.cart.state.collectAsState()
    val lines = cart.lines
    val session by container.session.state.collectAsState()
    val signedIn = session is SessionState.Authenticated
    val snackbarHost = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val collapse = rememberEffyCollapse()

    // Re-price on open (027 FR-004): a cart restored from disk must show TODAY's prices.
    LaunchedEffect(Unit) { container.syncCart() }

    /** Remove with UNDO (025 FR-041) — removing the wrong line is a one-tap mistake. */
    fun onRemoved(line: GuestCartLine) {
        scope.launch {
            val result = snackbarHost.showSnackbar("Removed ${line.name}", actionLabel = "Undo", duration = SnackbarDuration.Short)
            if (result == SnackbarResult.ActionPerformed) container.addToCart(line)
        }
    }

    if (lines.isEmpty()) {
        Column(modifier = Modifier.fillMaxSize()) {
            EffyLargeTitleBar(title = "Cart")
            // ⚠ Pull-to-refresh on the EMPTY cart too: "empty" is what a shopper doubts after adding on
            // another device.
            EffyPullToRefresh(onRefresh = { container.syncCart() }, modifier = Modifier.weight(1f).fillMaxWidth()) {
                Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.Center) {
                    EffyEmptyState(
                        title = "Your cart is empty",
                        body = "When you add products, they’ll appear here.",
                        icon = Res.drawable.lucide_shopping_cart,
                        actionLabel = "Start shopping",
                        onAction = onBrowse,
                    )
                }
            }
        }
        return
    }

    val currency = cart.currency.ifBlank { lines.first().currency }

    // 087 (Cart board) — the shopper's points and what is on sale. Each read failing draws nothing:
    // neither may break the cart.
    val tileCart = rememberTileCart(container)
    val points by produceState<PointsBalance?>(null, signedIn) {
        value = if (signedIn) runCatching { container.getPoints().first }.getOrNull()?.takeIf { it.points > 0 } else null
    }
    val onSale by produceState(emptyList<ProductCard>()) {
        value = runCatching { container.searchProducts(query = "", saleOnly = true).items.take(10) }.getOrDefault(emptyList())
    }

    // FR-032: emptying the cart is not recoverable, so it is confirmed — in a sheet (087: no dialogs).
    var confirmingClear by remember { mutableStateOf(false) }
    if (confirmingClear) {
        EffyConfirmSheet(
            title = "Empty your cart?",
            body = "This removes everything you are about to buy.",
            confirmLabel = "Empty cart",
            cancelLabel = "Keep it",
            icon = Res.drawable.lucide_trash_2,
            destructive = true,
            onConfirm = {
                confirmingClear = false
                container.clearCart()
            },
            onDismiss = { confirmingClear = false },
        )
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            EffyLargeTitleBar(title = "Cart", collapse = collapse)
            EffyPullToRefresh(onRefresh = { container.syncCart() }, modifier = Modifier.weight(1f).fillMaxWidth()) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().nestedScroll(collapse.connection),
                    contentPadding = PaddingValues(horizontal = EffySpacing.lg, vertical = EffySpacing.s),
                ) {
                    item(key = "count") {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                "${cart.itemCount} ${if (cart.itemCount == 1) "item" else "items"}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.weight(1f),
                            )
                            EffyGhostButton("Empty cart", onClick = { confirmingClear = true }, leading = Res.drawable.lucide_trash_2)
                        }
                    }
                    items(lines, key = { it.productId }) { line ->
                        Column(Modifier.animateItem()) {
                            CartRow(line, container, ::onRemoved)
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                        }
                    }
                    item(key = "summary") {
                        Column(
                            modifier = Modifier.padding(top = EffySpacing.xl, bottom = EffySpacing.xl),
                            verticalArrangement = Arrangement.spacedBy(EffySpacing.s),
                        ) {
                            Text("Order summary", style = MaterialTheme.typography.titleLarge)
                            // Promotional code (027 US8) — signed-in only.
                            if (signedIn) {
                                PromoField(
                                    applied = cart.discount,
                                    onApply = { code -> container.applyPromoCode(code) },
                                    onRemove = { container.removePromoCode() },
                                )
                            }
                            EffyDetailRow("Items (${cart.itemCount})", money(cart.itemSubtotalAmount, currency))
                            cart.discount?.let { d ->
                                // FR-045: shown as its OWN entry, in Effy green — a saving.
                                EffyDetailRow("${d.label} (${d.code})", "−" + money(d.amount, currency), valueColor = com.effyshopping.customer.mobile.core.theme.EffyRoles.brand)
                            }
                            EffyDetailRow("Delivery", "Calculated at checkout")
                            EffyHairline(inset = false, modifier = Modifier.padding(vertical = EffySpacing.xs))
                            EffyDetailRow("Total", money(cart.grandTotalAmount, currency) + " + delivery", emphasised = true)

                            // ⚠ FR-017/FR-019: a change that has not reached the platform yet, or was refused.
                            cart.failureMessage?.let { EffyInlineError(it) }
                            if (cart.failureMessage == null && cart.unsavedCount > 0) {
                                Text("Saving your changes…", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            // 087 FR-032 — said only to a GUEST. A signed-in shopper was told this too.
                            if (!signedIn) {
                                EffyNotice("You’ll sign in at checkout. Your cart is kept.", icon = Res.drawable.lucide_info)
                            }
                            // 087 (Cart board) — the points the shopper holds, said before checkout.
                            // ⚠ Only when they have some; a guest has none to read.
                            points?.let { p ->
                                EffyNotice(
                                    "You have ${formatPoints(p.points)} points (worth ${money(p.valueAmount, currency)}). Use them to pay at checkout.",
                                    icon = Res.drawable.lucide_coins,
                                )
                            }
                        }
                    }
                    // 087 (Cart board) — "On sale now": a rail of what is on sale, each with its "+".
                    if (onSale.isNotEmpty()) {
                        item(key = "sale") {
                            Column(Modifier.padding(bottom = EffySpacing.xl), verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
                                // The list already has its gutter — so not EffySectionHeader, which adds one.
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text("On sale now", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                                    EffyTextLink("See all", onClick = onSeeAllSale, modifier = Modifier.heightIn(min = EffyMinTouchTarget))
                                }
                                LazyRow(horizontalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
                                    items(onSale, key = { it.id }) { product ->
                                        EffyRailTile(
                                            product,
                                            onProductClick,
                                            width = 150.dp,
                                            cartQuantity = tileCart.quantityOf(product.id),
                                            onCartQuantityChange = { tileCart.change(product, it) },
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
            EffyPinnedBar {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Total + delivery", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                    EffyNumberRoll(money(cart.grandTotalAmount, currency), style = MaterialTheme.typography.titleLarge.copy(fontFeatureSettings = "tnum"))
                }
                // FR-026/FR-054: checkout is offered only when the PLATFORM says so, with the reason when not.
                when (cart.checkout.blockedReason) {
                    CartBlockedReason.NoPayableItems -> EffyInlineError("Nothing in your cart is available right now.")
                    CartBlockedReason.BelowMinimum -> EffyInlineError(
                        cart.checkout.remainingAmount?.let {
                            "Add ${money(it, currency)} more to reach the ${money(cart.checkout.minimumSubtotalAmount ?: "0.00", currency)} minimum."
                        } ?: "This order is below the minimum.",
                    )
                    else -> Unit
                }
                EffyPrimaryButton("Go to checkout", onClick = onCheckout, enabled = cart.checkout.allowed)
            }
        }
        EffySnackbarHost(snackbarHost, modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 140.dp))
    }
}

/**
 * The promotional-code field (027 FR-041/FR-043). The refusal it shows is the PLATFORM's, verbatim.
 */
@Composable
private fun PromoField(
    applied: CartDiscount?,
    onApply: suspend (String) -> String?,
    onRemove: suspend () -> Boolean,
) {
    val scope = rememberCoroutineScope()
    var code by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    if (applied != null) {
        EffyNotice("${applied.code} applied — ${applied.label}", icon = Res.drawable.lucide_tag, positive = true)
        EffyTextLink("Remove code", enabled = !busy, onClick = {
            busy = true
            scope.launch { onRemove(); busy = false }
        })
        return
    }

    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
        EffyField(
            label = "Promotional code",
            value = code,
            onValueChange = { code = it; error = null },
            error = error,
            modifier = Modifier.weight(1f),
        )
        EffySecondaryButton(
            "Apply",
            enabled = !busy && code.isNotBlank(),
            loading = busy,
            modifier = Modifier.weight(0.4f).padding(bottom = if (error != null) 28.dp else 0.dp),
            onClick = {
                busy = true
                scope.launch {
                    error = onApply(code.trim())
                    if (error == null) code = ""
                    busy = false
                }
            },
        )
    }
}

/** One cart line — picture, name, each-price, line total, stepper and Remove (Cart board). */
@Composable
private fun CartRow(line: GuestCartLine, container: AppContainer, onRemoved: (GuestCartLine) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = EffySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
    ) {
        Box(modifier = Modifier.size(72.dp).clip(EffyStorefrontShape.card).background(EffySurface.tint)) {
            ProductImage(line.imageUrl, line.name, modifier = Modifier.fillMaxSize())
        }
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(EffySpacing.xs)) {
            Row {
                Column(Modifier.weight(1f)) {
                    Text(line.name, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), maxLines = 2, overflow = TextOverflow.Ellipsis)
                    // FR-023/FR-024: a price that moved is SAID, with what it was.
                    Text(
                        money(line.unitPriceAmount, line.currency) + " each" + (line.priceChangedFrom?.let { " · was ${money(it, line.currency)}" } ?: ""),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.size(EffySpacing.s))
                Text(money(lineTotal(line), line.currency), style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold, fontFeatureSettings = "tnum"))
            }
            // FR-022: an unavailable line stays visible, flagged, excluded from every total.
            if (!line.available) EffyInlineError("Unavailable — not included in your total")
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (line.available) {
                    EffyQuantityStepper(quantity = line.quantity, onChange = { container.setCartQuantity(line.productId, it) })
                }
                Spacer(Modifier.weight(1f))
                EffyTextLink("Remove", onClick = {
                    container.removeFromCart(line.productId)
                    onRemoved(line)
                })
            }
        }
    }
}

private fun lineTotal(line: GuestCartLine): String {
    val unit = line.unitPriceAmount.toDoubleOrNull() ?: 0.0
    val cents = kotlin.math.round(unit * line.quantity * 100).toLong()
    return "${cents / 100}.${(cents % 100).toString().padStart(2, '0')}"
}
