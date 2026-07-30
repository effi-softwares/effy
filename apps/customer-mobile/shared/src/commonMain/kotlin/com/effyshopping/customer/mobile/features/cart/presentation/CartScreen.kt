package com.effyshopping.customer.mobile.features.cart.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.presentation.DisplaySize
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyButtonShape
import com.effyshopping.customer.mobile.core.presentation.EffyDetailRow
import com.effyshopping.customer.mobile.core.presentation.EffyDisplay
import com.effyshopping.customer.mobile.core.presentation.EffyEmptyState
import com.effyshopping.customer.mobile.core.presentation.EffyHairline
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.customer.mobile.core.presentation.EffyPullToRefresh
import com.effyshopping.customer.mobile.core.presentation.EffyQuantityStepper
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.customer.mobile.core.presentation.ProductImage
import com.effyshopping.customer.mobile.core.presentation.money
import com.effyshopping.customer.mobile.core.session.SessionState
import com.effyshopping.customer.mobile.features.cart.domain.CartBlockedReason
import com.effyshopping.customer.mobile.features.cart.domain.CartDiscount
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartLine
import com.effyshopping.customer.mobile.features.cart.domain.packagesOf
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_bookmark_outlined
import com.effyshopping.customer.mobile.resources.ic_cart_outlined
import com.effyshopping.customer.mobile.resources.ic_delete_outlined
import com.effyshopping.mobile.design.EffyRadius
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.mobile.kit.ui.EffyTopBar
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.painterResource

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
    val session by container.session.state.collectAsState()
    val signedIn = session is SessionState.Authenticated
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
        //
        // ⚠ The EMPTY cart is pull-to-refreshable too, and deliberately so: "empty" is precisely the state a
        // shopper doubts when they have just added something on another device. Refusing them the gesture
        // here would deny it exactly where they most want it.
        //
        // ⚠ The gesture needs something scrollable to hang off, and a plain `verticalScroll` Column TOP-ALIGNS
        // its content — which silently un-centred this screen when the gesture was added. `fillMaxSize` on the
        // inner content plus `Arrangement.Center` restores the 026 centred composition: the scroll modifier
        // buys the gesture, the height + arrangement keep the layout.
        Column(modifier = Modifier.fillMaxSize()) {
            EffyAppBar(title = "My Cart")
            EffyPullToRefresh(
                onRefresh = { container.syncCart() },
                modifier = Modifier.weight(1f).fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.Center,
                ) {
                    EffyEmptyState(
                        title = "Your Cart Is Empty!",
                        body = "When you add products, they’ll appear here.",
                        icon = Res.drawable.ic_cart_outlined,
                        actionLabel = "Start shopping",
                        onAction = onBrowse,
                    )
                }
            }
        }
        return
    }

    // 027: the totals come from the MIRROR, which carries the platform's own figures — so an unavailable
    // line is already excluded (FR-022) rather than being silently added up here. Before this the screen
    // recomputed from the raw lines and would have charged the shopper's eye for something they cannot buy.
    val currency = cart.currency.ifBlank { lines.first().currency }
    val packages = packagesOf(lines)
    val multiPackage = packages.size > 1

    // FR-032: emptying the cart is not recoverable, so it is confirmed. One dialog, one destructive verb.
    var confirmingClear by remember { mutableStateOf(false) }
    if (confirmingClear) {
        AlertDialog(
            onDismissRequest = { confirmingClear = false },
            title = { Text("Empty your cart?") },
            text = { Text("This removes everything you are about to buy. Items you saved for later are kept.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmingClear = false
                    container.clearCart()
                }) { Text("Empty cart") }
            },
            dismissButton = { TextButton(onClick = { confirmingClear = false }) { Text("Keep it") } },
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = "My Cart")
        SnackbarHost(hostState = snackbarHost)
        EffyPullToRefresh(
            onRefresh = { container.syncCart() },
            modifier = Modifier.weight(1f).fillMaxWidth(),
        ) {
            LazyColumn(modifier = Modifier.fillMaxSize().padding(horizontal = EffySpacing.lg)) {
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
                        CartRow(line, container, scope, ::onRemoved)
                        HorizontalDivider()
                    }
                }
        }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

        // ⚠ FR-017/FR-019: the shopper is told when a change has not reached the platform yet, and when one
        // was definitively refused. Without this the design is silent by construction — every failure is
        // swallowed so the cart never breaks, which is right for the cart and wrong for the shopper.
        if (cart.failureMessage != null) {
            Text(
                cart.failureMessage!!,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.fillMaxWidth().padding(horizontal = EffySpacing.lg, vertical = 4.dp),
            )
        } else if (cart.unsavedCount > 0) {
            Text(
                "Saving your changes…",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth().padding(horizontal = EffySpacing.lg, vertical = 4.dp),
            )
        }

        Column(
            modifier = Modifier.padding(EffySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(EffySpacing.s),
        ) {
            // ── Promotional code (027 US8) ────────────────────────────────────────────────────────
            //
            // ⚠ Signed-in only, and the guest sees WHY rather than a dead field: a per-shopper cap cannot be
            // enforced without an identity, and a discount shown then withdrawn is worse than one not yet
            // offered (research R10).
            if (signedIn) {
                PromoField(
                    applied = cart.discount,
                    currency = currency,
                    onApply = { code -> container.applyPromoCode(code) },
                    onRemove = { container.removePromoCode() },
                )
            }

            // The source's order summary: label/value rows with the total emphasised.
            EffyDetailRow("Sub-total", money(cart.itemSubtotalAmount, currency))
            cart.discount?.let { d ->
                // FR-045: shown as its OWN entry. A shopper must be able to see what they are getting, not
                // only that the total moved.
                EffyDetailRow("${d.label} (${d.code})", "−" + money(d.amount, currency))
            }
            Text(
                "Delivery is calculated at checkout once you choose an address.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            EffyHairline(modifier = Modifier.padding(vertical = EffySpacing.s))
            EffyDetailRow("Total", money(cart.grandTotalAmount, currency), emphasised = true)
            // FR-026/FR-054: checkout is offered only when the PLATFORM says so, and the reason is stated
            // when it does not. The client never decides this for itself — it is re-decided at intent.
            EffyPrimaryButton(
                "Go To Checkout",
                onClick = onCheckout,
                enabled = cart.checkout.allowed,
            )
            when (cart.checkout.blockedReason) {
                CartBlockedReason.NoPayableItems -> Text(
                    "Nothing in your cart is available right now.",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.error,
                )
                CartBlockedReason.BelowMinimum -> Text(
                    cart.checkout.remainingAmount?.let {
                        "Add ${money(it, currency)} more to reach the ${money(cart.checkout.minimumSubtotalAmount ?: "0.00", currency)} minimum."
                    } ?: "This order is below the minimum.",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.error,
                )
                else -> Unit
            }
            Text(
                "You’ll sign in at checkout. Your cart is kept.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * The promotional-code field (027 FR-041/FR-043).
 *
 * ⚠ The refusal it shows is the PLATFORM's, verbatim and specific — "expired", "already used", "below the
 * minimum" each call for a different response from the shopper, and a single "that code doesn't work"
 * would leave them guessing which. Nothing here judges a code (FR-042); it only carries the answer.
 */
@Composable
private fun PromoField(
    applied: CartDiscount?,
    currency: String,
    onApply: suspend (String) -> String?,
    onRemove: suspend () -> Boolean,
) {
    val scope = rememberCoroutineScope()
    var code by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    if (applied != null) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text("${applied.code} applied", style = MaterialTheme.typography.labelLarge)
            TextButton(
                enabled = !busy,
                onClick = {
                    busy = true
                    scope.launch {
                        onRemove()
                        busy = false
                    }
                },
            ) { Text("Remove") }
        }
        return
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
    ) {
        OutlinedTextField(
            value = code,
            onValueChange = {
                code = it
                error = null
            },
            singleLine = true,
            label = { Text("Promotional code") },
            isError = error != null,
            modifier = Modifier.weight(1f),
        )
        TextButton(
            enabled = !busy && code.isNotBlank(),
            onClick = {
                busy = true
                scope.launch {
                    error = onApply(code.trim())
                    if (error == null) code = ""
                    busy = false
                }
            },
        ) { Text("Apply") }
    }
    error?.let {
        Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
    }
}

/**
 * One SET-ASIDE line (027 FR-028..FR-031).
 *
 * Shows the same honesty as a payable line — current price, and whether it can be bought — because a
 * shopper deciding whether to bring something back needs to know it is still there and what it costs now.
 * An unavailable saved item cannot be restored (FR-031): putting a line back that cannot be bought is not a
 * restore, it is a trap.
 */
@Composable
private fun SavedRow(line: GuestCartLine, container: AppContainer, scope: kotlinx.coroutines.CoroutineScope) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = EffySpacing.s),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
    ) {
        ProductImage(
            url = line.imageUrl,
            name = line.name,
            modifier = Modifier.size(56.dp).clip(RoundedCornerShape(EffyRadius.sm)),
        )
        Column(modifier = Modifier.weight(1f)) {
            // Clamped for the same reason as the cart row's: an unclamped grocery name is three lines of a
            // phone's width and squeezes the controls beside it into wrapped nonsense.
            Text(
                line.name,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                money(line.unitPriceAmount, line.currency),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (!line.available) {
                Text(
                    "Unavailable",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
        TextButton(
            enabled = line.available,
            onClick = { scope.launch { container.restoreSaved(line.productId) } },
        ) { Text("Move to cart") }
        // Discarding a saved item is destructive and gets the same red icon as the cart row's remove —
        // one visual language for "this throws the thing away", both places it can happen.
        IconButton(onClick = { scope.launch { container.deleteSaved(line.productId) } }) {
            Icon(
                painterResource(Res.drawable.ic_delete_outlined),
                contentDescription = "Discard ${line.name}",
                tint = MaterialTheme.colorScheme.error,
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
private fun CartRow(
    line: GuestCartLine,
    container: AppContainer,
    scope: kotlinx.coroutines.CoroutineScope,
    onRemoved: (GuestCartLine) -> Unit,
) {
    // ⚠ TWO stacked rows, not one.
    //
    // The controls used to sit INSIDE the middle column, beside the name — a stepper plus two text
    // buttons in whatever width was left after an 88.dp thumbnail and the line total. On a phone that
    // leaves ~180.dp for ~300.dp of controls, so Compose squeezed them: "Remove" broke to "Rem/ove",
    // "Save for later" was pushed off-screen entirely, and the wrapped text made the row enormous.
    // Controls get their own full-width row underneath, where their width is not somebody else's
    // leftovers.
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = EffySpacing.md)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
        ) {
            Box(
                modifier = Modifier
                    .size(72.dp)
                    .clip(RoundedCornerShape(EffyRadius.md))
                    .background(EffySurface.tint),
            ) {
                ProductImage(line.imageUrl, line.name, modifier = Modifier.fillMaxSize())
            }

            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(EffySpacing.xs)) {
                Text(
                    line.name,
                    style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
                    // A long grocery name is three lines of a phone's width and pushes everything below it
                    // down. Two lines then an ellipsis; the full name is on the product page.
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    money(line.unitPriceAmount, line.currency) + " each",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                // ⚠ FR-023/FR-024: a price that moved is SAID, with what it was. The shopper pays the current
                // price either way — the point is that they find out here rather than at payment, which is the
                // most expensive possible moment to discover it.
                line.priceChangedFrom?.let { was ->
                    Text(
                        "Was ${money(was, line.currency)}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                // FR-022: an unavailable line stays visible and flagged — a temporary state may be waited out —
                // but it is excluded from every total and cannot be paid for.
                if (!line.available) {
                    Text(
                        "Unavailable — not included in your total",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }

            Text(
                money(lineTotal(line), line.currency),
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.s),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            EffyQuantityStepper(
                quantity = line.quantity,
                onChange = { container.setCartQuantity(line.productId, it) },
            )
            Spacer(Modifier.weight(1f))
            // FR-028: the non-destructive alternative to Remove. Without it "I'm not sure about this"
            // has only one answer — delete — and shoppers avoid that by abandoning the whole cart.
            //
            // ⚠ A bookmark, deliberately NOT a heart: the heart is Favourites, a different capability with
            // its own screen, and reusing it here would tell a shopper the two lists are the same one.
            IconButton(onClick = { scope.launch { container.setAside(line.productId) } }) {
                Icon(
                    painterResource(Res.drawable.ic_bookmark_outlined),
                    contentDescription = "Save ${line.name} for later",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            // ⚠ The only destructive-coloured thing on the screen. As a text button it read with exactly
            // the same weight as "Save for later" — two equal-looking words, one of which throws the item
            // away. Colour now says which is which before either is read; the two icons are also
            // neutral-vs-error rather than two identical grey glyphs.
            IconButton(onClick = {
                container.removeFromCart(line.productId)
                onRemoved(line)
            }) {
                Icon(
                    painterResource(Res.drawable.ic_delete_outlined),
                    contentDescription = "Remove ${line.name}",
                    tint = MaterialTheme.colorScheme.error,
                )
            }
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
