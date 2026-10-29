package com.effyshopping.customer.mobile.features.checkout.presentation

import androidx.compose.material3.Icon
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.animation.AnimatedVisibility
import com.effyshopping.customer.mobile.resources.lucide_circle_check
import com.effyshopping.customer.mobile.resources.lucide_truck
import com.effyshopping.customer.mobile.resources.lucide_info
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import com.effyshopping.customer.mobile.core.theme.EffyRoles
import com.effyshopping.customer.mobile.core.presentation.money
import com.effyshopping.customer.mobile.core.presentation.EffySize
import com.effyshopping.customer.mobile.core.presentation.EffyCard
import com.effyshopping.customer.mobile.core.presentation.EffyLoading
import com.effyshopping.customer.mobile.core.presentation.EffySkeletonText
import com.effyshopping.customer.mobile.core.presentation.EffyNotice
import com.effyshopping.customer.mobile.core.presentation.EffyTextLink
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.customer.mobile.core.presentation.EffyNumberRoll
import com.effyshopping.customer.mobile.core.presentation.EffyPinnedBar
import com.effyshopping.customer.mobile.core.presentation.EffyInlineError
import com.effyshopping.customer.mobile.core.presentation.EffySwitchRow
import com.effyshopping.customer.mobile.core.presentation.EffyGroup
import com.effyshopping.customer.mobile.core.presentation.EffyCheckboxRow
import com.effyshopping.customer.mobile.core.presentation.EffySkeletonBlock
import com.effyshopping.customer.mobile.core.delivery.CoverageWords
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.FilterChip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.effyshopping.customer.mobile.features.checkout.domain.ChosenWindow
import com.effyshopping.customer.mobile.features.checkout.domain.CourierDelivery
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryType
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFee
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryWindowText
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import com.effyshopping.customer.mobile.features.deliveryinstructions.presentation.DeliveryInstructionsField
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import com.effyshopping.customer.mobile.core.nav.CustomerNavKey
import com.effyshopping.customer.mobile.features.legal.presentation.LegalLinksText
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffySecondaryButton
import com.effyshopping.customer.mobile.core.presentation.EffyDetailRow
import com.effyshopping.customer.mobile.core.presentation.EffyHairline
import com.effyshopping.mobile.design.EffySpacing
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_arrow_back
import com.effyshopping.mobile.kit.ui.EffyTopBar
import org.jetbrains.compose.resources.painterResource
import com.effyshopping.customer.mobile.features.addresses.domain.SavedAddress
import com.effyshopping.customer.mobile.features.addresses.presentation.AddressFormSheet
import com.effyshopping.customer.mobile.features.cart.domain.formatCents
import com.effyshopping.customer.mobile.features.cart.domain.parseCents
import com.effyshopping.customer.mobile.core.presentation.EffySheet
import com.effyshopping.customer.mobile.core.presentation.EffyProgressBar
import com.effyshopping.customer.mobile.core.presentation.EffyStatusPill
import com.effyshopping.customer.mobile.core.presentation.EffyStatusKind
import com.effyshopping.customer.mobile.core.presentation.EffyMinTouchTarget
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.customer.mobile.core.presentation.ProductImage
import com.effyshopping.customer.mobile.resources.lucide_lock
import com.effyshopping.customer.mobile.resources.lucide_map_pin
import com.effyshopping.customer.mobile.features.cart.domain.CartSnapshot
import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutPoints
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.text.style.TextAlign

/**
 * Checkout, signed in only. The default saved address is pre-selected (switch, or add one inline), then who
 * delivers and when, instructions, a "Billing same as shipping" toggle, and pay. Pressing pay creates the
 * order and its intent and hands over to Effy's payment screen through [onProceedToPayment]; checkout
 * itself ends unpaid.
 */
@Composable
fun CheckoutScreen(
    container: AppContainer,
    onProceedToPayment: () -> Unit,
    onBack: () -> Unit,
    /** Points paid for everything; the order is placed. Open its receipt. */
    onPlacedWithPoints: (orderId: String) -> Unit = {},
) {
    val vm = viewModel {
        CheckoutViewModel(
            listAddresses = container.listSavedAddresses,
            addAddress = container.addSavedAddress,
            createIntent = container.createIntent,
            handoff = container.paymentHandoff,
            quoteDelivery = container.quoteDelivery,
            saveAddressInstructions = container.saveAddressInstructions,
        )
    }
    val state by vm.state.collectAsState()

    val handedOff = (state as? CheckoutUiState.Ready)?.handedOffToPayment == true
    LaunchedEffect(handedOff) {
        if (handedOff) {
            // Disarm first. Navigating first and disarming second leaves the flag set for however long
            // the transition takes, and a shopper who backs out inside that window is sent straight back.
            vm.handoffConsumed()
            onProceedToPayment()
        }
    }

    val placed = (state as? CheckoutUiState.Ready)?.placedWithPoints
    LaunchedEffect(placed) {
        if (placed != null) {
            vm.placedConsumed()
            onPlacedWithPoints(placed)
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // The app bar already names the screen — the duplicate H3 beneath it was the screen
        // saying "Checkout" twice, which the source never does.
        EffyAppBar(title = "Checkout", onBack = onBack)

        when (val s = state) {
            CheckoutUiState.Loading -> CheckoutSkeleton()

            is CheckoutUiState.Ready -> {
                val cart by container.cart.state.collectAsState()
                AddressAndPay(
                    s,
                    vm,
                    cart = cart,
                    // Checkout is pushed from the cart: back is the cart.
                    onEditCart = onBack,
                    onNavigateLegal = { container.navigator.push(CustomerNavKey.LegalDocument(it)) },
                )
            }
        }
    }
}

/**
 * Numbered cards (1 address, 2 who delivers and when, 3 instructions), then points, billing and the order
 * summary, with the card amount and "Pay now" pinned at the bottom. Cards are the storefront pattern here:
 * an address and a window are choosable objects. No step indicator.
 */
@Composable
private fun AddressAndPay(
    s: CheckoutUiState.Ready,
    vm: CheckoutViewModel,
    cart: CartSnapshot,
    onEditCart: () -> Unit,
    onNavigateLegal: (String) -> Unit,
) {
    var pickingAddress by remember { mutableStateOf(false) }
    val selected = s.addresses.firstOrNull { it.id == s.selectedId }
    // Delivery as charged: the fee less this option's delivery offer.
    val deliveryCharged = s.deliveryFee?.let { f -> f.promotionAmount?.let { fromCents(toCents(f.totalAmount) - toCents(it)) } ?: f.totalAmount }
    val pay = checkoutAmounts(cart.grandTotalAmount, deliveryCharged, s.points?.takeIf { s.usePoints })

    Column(modifier = Modifier.fillMaxSize()) {
    Column(
        modifier = Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(EffySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
    ) {
        NumberedCard(
            number = 1,
            title = "Delivery address",
            subtitle = "Where should we bring your order?",
            action = if (s.addresses.isEmpty()) null else "Change",
            onAction = { pickingAddress = true },
        ) {
            if (selected == null) {
                // No saved address → a prompt that blocks pay (023 US1 scenario 3, FR-007).
                Text("Add a delivery address to continue.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                EffySecondaryButton("Add a new address", onClick = { vm.openAddAddress(AddressTarget.SHIPPING) })
            } else {
                AddressSummary(selected, deliveredBy = s.quote?.takeIf { !s.quoting && it.serviced }?.deliveryType)
            }
        }

        // Delivery — serviceability + the GST-inclusive fee, shown before pay (no drip). The
        // server owns every fee.
        DeliverySection(s, vm)

        // What the shopper tells the driver. Shown once there is an address for it to be about.
        if (s.selectedId != null) {
            NumberedCard(3, "Delivery instructions", "Optional. Your driver sees this when they deliver.") {
                DeliveryInstructionsField(draft = s.instructions, onChange = vm::setInstructions, title = null, hint = null)
                // Offered only when there is something new to save — an always-present switch is a chore.
                if (s.instructionsDiffer) {
                    EffyCheckboxRow(
                        label = "Save to this address for next time",
                        checked = s.saveInstructions,
                        onCheckedChange = vm::setSaveInstructions,
                    )
                }
            }
        }

        // Effy points, only when the shopper has some.
        s.points?.let { points ->
            EffyCard(padding = EffySpacing.md) {
                EffySwitchRow(
                    label = "Use my Effy points",
                    supporting = "${formatPointsCount(points.usable)} points, worth \$${points.valueAmount}. Any rest is paid by card.",
                    checked = s.usePoints,
                    onCheckedChange = vm::setUsePoints,
                )
                Text(
                    "Points are a way of paying — your order total stays the same.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = EffySpacing.xs),
                )
            }
        }

        BillingSection(s, vm)

        OrderSummaryCard(cart, s, pay, onEditCart)

        s.error?.let { EffyInlineError(it) }

        // Point-of-sale consent — the purchase terms, at the moment of paying.
        LegalLinksText(
            "By placing your order you agree to our [Terms of Service](/legal/terms-of-service), " +
                "[Delivery Policy](/legal/delivery-policy) and [Refund & Returns Policy](/legal/refunds-returns).",
            onNavigateSlug = onNavigateLegal,
        )
    }

    val billingReady = s.billingSameAsShipping || s.billingSelectedId != null
    // Pay is blocked until delivery is confirmed for the address.
    val payEnabled = !s.paying && s.selectedId != null && billingReady && s.serviced
    EffyPinnedBar {
        // What the shopper is about to commit to on their card: the cart's total, plus the delivery fee
        // once chosen, less the points they spend. What is charged is decided at the intent (and shown,
        // exactly, on Payment); this adds figures the platform already gave, and says "+ delivery" until
        // there is a fee to add.
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                if (pay.pointsAmount != null) "To pay by card" else "Total",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            EffyNumberRoll(
                if (pay.deliveryKnown) money(pay.cardAmount, cart.currency) else money(pay.cardAmount, cart.currency) + " + delivery",
                style = MaterialTheme.typography.titleLarge.copy(fontFeatureSettings = "tnum"),
            )
        }
        EffyPrimaryButton(
            if (s.paying) "Processing…" else "Pay now",
            onClick = vm::payNow,
            enabled = payEnabled,
            loading = s.paying,
            leading = { Icon(painterResource(Res.drawable.lucide_lock), contentDescription = null, modifier = Modifier.size(18.dp)) },
        )
    }
    }

    // The address is one card with "Change"; the saved list opens in a sheet (Checkout board).
    if (pickingAddress) {
        EffySheet(title = "Delivery address", onDismiss = { pickingAddress = false }, cancelLabel = null) {
            Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
                s.addresses.forEach { addr ->
                    AddressPickRow(addr, selected = addr.id == s.selectedId, onSelect = {
                        vm.select(addr.id)
                        pickingAddress = false
                    })
                }
                EffySecondaryButton("Add a new address", onClick = {
                    pickingAddress = false
                    vm.openAddAddress(AddressTarget.SHIPPING)
                })
            }
        }
    }

    // The shared add-address form — raised for shipping OR billing.
    // On the shared EffySheet now, which owns the title and the Save/Cancel pair.
    s.sheet?.let { sheet ->
        EffySheet(
            title = "Add an address",
            onDismiss = vm::dismissSheet,
            primaryLabel = "Save address",
            onPrimary = vm::submitAddress,
            primaryEnabled = !sheet.saving,
        ) {
            AddressFormSheet(
                form = sheet.form,
                fieldErrors = sheet.fieldErrors,
                onChange = vm::onSheetFormChange,
            )
        }
    }
}

/** The selected address, as the board writes it: "Home · Default", then "Name · line, city postcode". */
@Composable
private fun AddressSummary(addr: SavedAddress, deliveredBy: DeliveryType?) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
            Icon(painterResource(Res.drawable.lucide_map_pin), contentDescription = null, modifier = Modifier.size(18.dp))
            Text(addr.label?.takeIf { it.isNotBlank() } ?: addr.recipientName, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold))
            if (addr.isDefault) EffyStatusPill("Default", EffyStatusKind.Inert)
        }
        Text("${addr.recipientName} · ${addr.shortSummary()}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        // Who delivers to this address, in the shared words, once the quote has said.
        deliveredBy?.let {
            Text(
                if (it == DeliveryType.EFFY) DeliveryTypeWords.EFFY else DeliveryTypeWords.COURIER,
                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                color = if (it == DeliveryType.EFFY) EffyRoles.brand else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * The money lines checkout shows, added from figures the platform gave (no float; cents only).
 * [pointsAmount] is what the points would cover — never more than the total. An estimate of the
 * split until Payment, which shows the exact one the intent decided.
 */
internal data class CheckoutAmounts(
    val totalAmount: String,
    val deliveryKnown: Boolean,
    val pointsUsed: Long?,
    val pointsAmount: String?,
    val cardAmount: String,
)

internal fun checkoutAmounts(itemsTotal: String, deliveryTotal: String?, points: CheckoutPoints?): CheckoutAmounts {
    val total = if (deliveryTotal != null) addAmounts(itemsTotal, deliveryTotal) else itemsTotal
    val totalCents = toCents(total)
    if (points == null || points.usable <= 0 || points.centsPerPoint <= 0 || totalCents <= 0) {
        return CheckoutAmounts(total, deliveryTotal != null, null, null, total)
    }
    val coverCents = minOf(points.usable * points.centsPerPoint, totalCents)
    // Whole points only: the points spent round UP to cover what they pay for, never past what is held.
    val used = minOf(points.usable, (coverCents + points.centsPerPoint - 1) / points.centsPerPoint)
    return CheckoutAmounts(total, deliveryTotal != null, used, fromCents(coverCents), fromCents(totalCents - coverCents))
}

private fun toCents(x: String): Long {
    val neg = x.startsWith("-")
    val parts = x.removePrefix("-").split(".")
    val whole = parts[0].toLongOrNull() ?: 0L
    val frac = (parts.getOrNull(1) ?: "0").padEnd(2, '0').take(2).toLongOrNull() ?: 0L
    return (whole * 100 + frac) * if (neg) -1 else 1
}

private fun fromCents(c: Long): String {
    val sign = if (c < 0) "-" else ""
    val abs = kotlin.math.abs(c)
    return "$sign${abs / 100}.${(abs % 100).toString().padStart(2, '0')}"
}

/**
 * Order summary (Checkout board): thumbnails ("+N more"), Items (n), the promotion in green, the
 * delivery lines the server priced, how close the basket is to free delivery, Total, points, and what
 * is paid by card. "Edit cart" goes back to the cart.
 */
@Composable
private fun OrderSummaryCard(cart: CartSnapshot, s: CheckoutUiState.Ready, pay: CheckoutAmounts, onEditCart: () -> Unit) {
    val lines = cart.lines.filter { it.available }
    EffyCard(padding = EffySpacing.lg) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Order summary", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            EffyTextLink("Edit cart", onClick = onEditCart, modifier = Modifier.heightIn(min = EffyMinTouchTarget))
        }
        if (lines.isNotEmpty()) {
            Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s), verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = EffySpacing.s)) {
                lines.take(4).forEach { line ->
                    ProductImage(line.imageUrl, line.name, Modifier.size(48.dp).clip(EffyStorefrontShape.card))
                }
                if (lines.size > 4) {
                    Box(Modifier.size(48.dp).clip(EffyStorefrontShape.card).background(EffySurface.tint), contentAlignment = Alignment.Center) {
                        Text("+${lines.size - 4} more", style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.Center)
                    }
                }
            }
        }
        EffyDetailRow("Items (${cart.itemCount})", money(cart.itemSubtotalAmount, cart.currency))
        // One row per promotion applying, automatic and by code.
        cart.promotions.filter { it.goodsAmount != "0.00" }.forEach { p ->
            EffyDetailRow(if (p.code != null) "${p.headline} (${p.code})" else p.headline, "−" + money(p.goodsAmount, cart.currency), valueColor = EffyRoles.brand)
        }
        val fee = s.deliveryFee
        when {
            fee != null -> fee.lines.forEach { line ->
                val saving = line.amount.startsWith("-")
                EffyDetailRow(
                    DeliveryFeeWords.label(line.kind),
                    if (saving) "−$${line.amount.removePrefix("-")}" else "$${line.amount}",
                    // A saving (free delivery) in Effy green — the storefront's savings colour.
                    valueColor = if (saving) EffyRoles.brand else androidx.compose.ui.graphics.Color.Unspecified,
                )
            }
            s.serviced -> EffyDetailRow("Delivery", "Choose a delivery option")
        }
        fee?.promotionAmount?.let { off ->
            EffyDetailRow("Delivery offer", "−" + money(off, cart.currency), valueColor = EffyRoles.brand)
        }
        val freeRemaining = s.quote?.freeDeliveryRemainingAmount?.takeIf { s.serviced }
        when {
            fee?.free == true -> EffyNotice(DeliveryFeeWords.FREE_REACHED, icon = Res.drawable.lucide_circle_check, positive = true)
            freeRemaining != null -> Column(Modifier.padding(vertical = EffySpacing.xs), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(DeliveryFeeWords.spendMore("$$freeRemaining"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                // How far along the basket is: what it is, over what it is plus what is still needed.
                val have = toCents(cart.grandTotalAmount).coerceAtLeast(0)
                val need = toCents(freeRemaining).coerceAtLeast(0)
                EffyProgressBar(if (have + need == 0L) 0f else have.toFloat() / (have + need))
            }
        }
        EffyHairline(inset = false, modifier = Modifier.padding(vertical = EffySpacing.xs))
        EffyDetailRow("Total", if (pay.deliveryKnown) money(pay.totalAmount, cart.currency) else money(pay.totalAmount, cart.currency) + " + delivery", emphasised = true)
        if (pay.pointsAmount != null && pay.pointsUsed != null) {
            EffyDetailRow("Points (${formatPointsCount(pay.pointsUsed)})", "−" + money(pay.pointsAmount, cart.currency), valueColor = EffyRoles.brand)
            EffyDetailRow("To pay by card", money(pay.cardAmount, cart.currency), emphasised = true)
        }
    }
}

/**
 * One numbered checkout section — "1. Delivery address" with its one-line purpose and an optional
 * blue action ("Change") on the right (Checkout board).
 */
/** Checkout before the cart and addresses are read: the same numbered cards and the summary, values as bones. */
@Composable
private fun CheckoutSkeleton() {
    val type = MaterialTheme.typography
    EffyLoading(Modifier.fillMaxSize(), label = "Loading checkout") {
        Column(Modifier.fillMaxSize().padding(EffySpacing.lg), verticalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
            NumberedCard(number = 1, title = "Delivery address", subtitle = "Where should we bring your order?") {
                EffySkeletonText(type.bodyLarge, Modifier.fillMaxWidth(), widthFraction = 0.5f)
                EffySkeletonText(type.bodyMedium, Modifier.fillMaxWidth(), widthFraction = 0.8f)
            }
            NumberedCard(number = 2, title = "Delivery", subtitle = null) { DeliveryOptionsSkeleton() }
            EffyCard(padding = EffySpacing.lg) {
                Text("Order summary", style = type.titleMedium)
                Row(Modifier.padding(vertical = EffySpacing.s), horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
                    repeat(3) { EffySkeletonBlock(Modifier.size(48.dp)) }
                }
                repeat(2) { i ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        EffySkeletonText(type.bodyMedium, Modifier.weight(1f), widthFraction = if (i == 0) 0.3f else 0.25f)
                        EffySkeletonText(type.bodyMedium, Modifier.width(64.dp))
                    }
                }
            }
        }
    }
}

/** Step 2's choices while the quote is worked out: a two-by-two of option tiles. */
@Composable
private fun DeliveryOptionsSkeleton() {
    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
        repeat(2) {
            Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
                repeat(2) { EffySkeletonBlock(Modifier.weight(1f).height(56.dp), radius = EffyStorefrontShape.md) }
            }
        }
    }
}

@Composable
private fun NumberedCard(
    number: Int,
    title: String,
    subtitle: String?,
    titleColor: androidx.compose.ui.graphics.Color? = null,
    action: String? = null,
    onAction: () -> Unit = {},
    content: @Composable ColumnScope.() -> Unit,
) {
    EffyCard(padding = EffySpacing.lg) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("$number. $title", style = MaterialTheme.typography.titleMedium, color = titleColor ?: MaterialTheme.colorScheme.onSurface)
                subtitle?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            if (action != null) EffyTextLink(action, onClick = onAction, modifier = Modifier.heightIn(min = EffyMinTouchTarget))
        }
        Spacer(Modifier.height(EffySpacing.md))
        Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.s), content = content)
    }
}

/**
 * Delivery: serviceability, then who delivers and — for Effy — when.
 * No distance, ring, or shop is ever shown.
 *
 * No slot is selected for the shopper: a window is a promise about when someone will be
 * home.
 */
@Composable
private fun DeliverySection(s: CheckoutUiState.Ready, vm: CheckoutViewModel) {
    if (s.selectedId == null) return
    val quote = s.quote
    // The section is headed by who delivers, once the quote says.
    val type = quote?.takeUnless { s.quoting }?.takeIf { it.serviced }?.deliveryType
    val heading = when (type) {
        DeliveryType.COURIER -> DeliveryTypeWords.COURIER
        DeliveryType.EFFY -> DeliveryTypeWords.EFFY
        null -> "Delivery"
    }
    val subtitle = when {
        type == DeliveryType.EFFY && quote.effyWindows != null -> "Choose one delivery option for the whole order."
        else -> null
    }
    NumberedCard(2, heading, subtitle) {
    when {
        // The options' places while the quote is worked out; who delivers is not known yet.
        s.quoting || quote == null -> EffyLoading(label = "Checking delivery") { DeliveryOptionsSkeleton() }
        // The one refusal sentence (CoverageWords), the same the address book shows. No red.
        !quote.serviced -> EffyInlineError(CoverageWords.REFUSAL)
        // A courier delivers: Nothing to choose.
        quote.courier != null -> CourierSection(quote.courier)
        // Effy delivers: the shopper picks one window for the order.
        quote.effyWindows != null -> EffyWindowsSection(
            view = effyWindowsView(quote.effyWindows, nowEpochMillis()),
            chosen = s.window,
            asapChosen = s.asap,
            enabled = !s.paying,
            onChoose = vm::setWindow,
            onClear = vm::clearWindow,
            onAsap = vm::setAsap,
        )
        // A serviced quote with neither block is a server fault: nothing is drawn, and nothing can be paid for.
        else -> Unit
    }
    }
}

/** Adds two decimal-string amounts in whole cents (no float touches money). */
internal fun addAmounts(a: String, b: String): String {
    fun cents(x: String): Long {
        val neg = x.startsWith("-")
        val parts = x.removePrefix("-").split(".")
        val whole = parts[0].toLongOrNull() ?: 0L
        val frac = (parts.getOrNull(1) ?: "0").padEnd(2, '0').take(2).toLongOrNull() ?: 0L
        return (whole * 100 + frac) * if (neg) -1 else 1
    }
    val total = cents(a) + cents(b)
    val sign = if (total < 0) "-" else ""
    val abs = kotlin.math.abs(total)
    return "$sign${abs / 100}.${(abs % 100).toString().padStart(2, '0')}"
}

/**
 * When the order arrives, when Effy delivers it: One choice for the whole order.
 *
 *  Same-day delivery (a black "Today" badge) today's open windows, each with the time to order by;
 *  Standard delivery "Standard" (as soon as possible — its title and the business's estimate,
 *  nothing else) then the next delivery days, two tiles a row — A day is A
 *  complete choice — and, under the grid, the chosen day's optional
 *  "Need a specific time?" with that day's windows.
 *
 * Every word is `effyWindowsView`'S and [DeliveryWindowWords]' — twins of what the website renders,
 * pinned to the same fixture. This composable only lays the words out.
 * Nothing is selected for the shopper.
 * What is selected is derived from the choice. The only local state is the day tapped when it
 * cannot be bought without a time (nothing is then chosen, and its windows open by themselves), and
 * whether the optional time list is open.
 * Every target is at least 48dp.
 */
@Composable
private fun EffyWindowsSection(
    view: EffyWindowsView,
    chosen: ChosenWindow?,
    asapChosen: Boolean,
    enabled: Boolean,
    onChoose: (slotId: String, date: String) -> Unit,
    onClear: () -> Unit,
    onAsap: () -> Unit,
) {
    view.unavailable?.let { sentence ->
        EffyInlineError(sentence)
        return
    }

    // A day tapped that cannot be bought without a time — nothing is chosen yet.
    var pendingDay by remember { mutableStateOf<String?>(null) }
    // "Need a specific time?" opened under a day that can be bought without one.
    var timeOpen by remember { mutableStateOf(false) }

    val chosenLater = chosen?.let { c -> view.later.firstOrNull { it.date == c.date } }
    val nothingChosen = chosen == null && !asapChosen
    val activeDay = chosenLater ?: if (nothingChosen) view.later.firstOrNull { it.date == pendingDay } else null
    val timedOnActive = activeDay != null && chosen != null && activeDay.anyTime?.slotId != chosen.slotId
    val timesShown = activeDay != null && (timedOnActive || timeOpen || activeDay.anyTime == null)

    Column(modifier = Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
        view.today?.let { today ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
                TodayBadge()
                Text(view.sameDayTitle, style = MaterialTheme.typography.titleSmall)
            }
            EffyDayWindows(today, chosen, enabled) { slotId, date ->
                pendingDay = null
                timeOpen = false
                onChoose(slotId, date)
            }
        }

        if (view.later.isNotEmpty() || view.asap != null) {
            Text(view.standardTitle, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = EffySpacing.md))
        }

        // "Standard" first, then the days — one grid, two to a row (Checkout board).
        val tiles: List<@Composable RowScope.() -> Unit> = buildList {
            view.asap?.let { asap ->
                add {
                    ChoiceTile(
                        selected = asapChosen,
                        enabled = enabled,
                        onClick = {
                            pendingDay = null
                            timeOpen = false
                            onAsap()
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(asap.title, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium))
                        // Always the business's estimate, as an estimate — never a day.
                        Text(asap.estimate, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            view.later.forEach { day ->
                add {
                    val unavailable = day.anyTime == null && day.windows.isEmpty()
                    ChoiceTile(
                        selected = activeDay?.date == day.date,
                        enabled = enabled && !unavailable,
                        onClick = {
                            timeOpen = false
                            val anyTime = day.anyTime
                            if (anyTime != null) {
                                pendingDay = null
                                onChoose(anyTime.slotId, anyTime.date)
                            } else {
                                // No way to buy this day without a time: nothing is chosen until one is.
                                pendingDay = day.date
                                onClear()
                            }
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(day.label, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium))
                        Text(
                            when {
                                // A day with neither untimed room nor a window says why.
                                unavailable -> day.sentence.orEmpty()
                                day.anyTime != null -> DeliveryWindowWords.ANY_TIME_DAY
                                else -> DeliveryWindowWords.TIME_REQUIRED
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
        tiles.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s), modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
                pair.forEach { it() }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }

        // The chosen day's details open under the grid (animated — Motion board), rather than appearing.
        AnimatedVisibility(activeDay != null) {
            val day = activeDay ?: return@AnimatedVisibility
            Column(modifier = Modifier.padding(top = EffySpacing.xs), verticalArrangement = Arrangement.spacedBy(EffySpacing.xs)) {
                val anyTime = day.anyTime
                if (anyTime != null && day.windows.isNotEmpty()) {
                    EffyTextLink(
                        DeliveryWindowWords.TIME_OPTION_OPEN,
                        enabled = enabled,
                        onClick = {
                            if (timesShown) {
                                timeOpen = false
                                // Closing it lets go of a time: the day alone is the choice again.
                                if (timedOnActive) onChoose(anyTime.slotId, anyTime.date)
                            } else {
                                timeOpen = true
                            }
                        },
                    )
                }
                if (timesShown && day.windows.isNotEmpty()) {
                    if (anyTime != null) {
                        Text(DeliveryWindowWords.TIME_OPTION_HINT, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    EffyDayWindows(day.copy(sentence = null), chosen, enabled, onChoose)
                }
            }
        }
    }
}

/** "Today" — the black badge beside Same-day delivery (Checkout board). */
@Composable
private fun TodayBadge() {
    Box(
        Modifier
            .clip(EffyStorefrontShape.small)
            .background(MaterialTheme.colorScheme.onSurface)
            .padding(horizontal = 6.dp, vertical = 2.dp),
    ) {
        Text("Today", style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold), color = MaterialTheme.colorScheme.background)
    }
}

/**
 * A delivery choice: white with a hairline, or — chosen — the light-blue tint with a 2dp blue edge.
 * The whole tile is the target, announced as one radio button.
 */
@Composable
private fun ChoiceTile(
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxHeight()
            .heightIn(min = EffySize.tile)
            .clip(EffyStorefrontShape.card)
            .background(if (selected) EffyRoles.primaryMuted else MaterialTheme.colorScheme.background)
            .border(if (selected) 2.dp else 1.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline, EffyStorefrontShape.card)
            .selectable(selected = selected, enabled = enabled, role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = EffySpacing.md, vertical = EffySpacing.s)
            .graphicsLayer { alpha = if (enabled) 1f else 0.5f },
        verticalArrangement = Arrangement.Center,
        content = content,
    )
}

@Composable
private fun EffyDayWindows(day: EffyDayView, chosen: ChosenWindow?, enabled: Boolean, onChoose: (String, String) -> Unit) {
    day.sentence?.let {
        Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    // Two tiles per row (Checkout board).
    day.windows.chunked(2).forEach { pair ->
        Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s), modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
            pair.forEach { w ->
                val selected = chosen?.slotId == w.slotId && chosen.date == w.date
                ChoiceTile(
                    selected = selected,
                    enabled = enabled && !w.closed,
                    onClick = { onChoose(w.slotId, w.date) },
                    modifier = Modifier.weight(1f),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(w.label, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), modifier = Modifier.weight(1f, fill = false))
                        // What this window adds, before it is chosen. Nothing when it adds nothing.
                        w.surchargeAmount?.let { Text("  +$$it", style = MaterialTheme.typography.bodySmall) }
                    }
                    w.note?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
            if (pair.size == 1) Spacer(Modifier.weight(1f))
        }
    }
}

@OptIn(kotlin.time.ExperimentalTime::class)
private fun nowEpochMillis(): Long = kotlin.time.Clock.System.now().toEpochMilliseconds()

/**
 * The delivery section when a courier delivers the order: who, and roughly when.
 *
 * There is nothing to choose, and so nothing to tap. No window, no day, no method — a disabled
 * picker would only suggest one was meant to be there.
 * Every word is [DeliveryTypeWords]' — the twin of what the website prints. The estimate is always
 * said AS an estimate. Its fee is in the order summary, line by line.
 * When the address IS one Effy delivers to and no window is left, the shopper is told that first:
 * they were expecting a time to pick.
 */
@Composable
private fun CourierSection(courier: CourierDelivery) {
    val (partner, estimate) = DeliveryTypeWords.courierLines(courier.estimate)
    if (courier.noWindowLeft) {
        EffyNotice("${DeliveryTypeWords.NO_WINDOWS_LEFT} ${DeliveryTypeWords.COURIER_INSTEAD_OF_WINDOWS}", icon = Res.drawable.lucide_info)
    }
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
        Icon(painterResource(Res.drawable.lucide_truck), contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp))
        Column {
            Text(partner, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium))
            Text(estimate, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** Billing address: "same as shipping" ON by default; off reveals the same picker. A card. */
@Composable
private fun BillingSection(s: CheckoutUiState.Ready, vm: CheckoutViewModel) {
    EffyCard(padding = EffySpacing.md) {
        EffySwitchRow(
            label = "Billing address same as shipping",
            checked = s.billingSameAsShipping,
            onCheckedChange = vm::setBillingSameAsShipping,
        )
        AnimatedVisibility(!s.billingSameAsShipping) {
            Column(Modifier.padding(top = EffySpacing.s), verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
                if (s.addresses.isEmpty()) {
                    Text(
                        "Add a billing address to continue.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    s.addresses.forEach { addr ->
                        AddressPickRow(addr, selected = addr.id == s.billingSelectedId, onSelect = { vm.selectBilling(addr.id) })
                    }
                }
                EffySecondaryButton("Add a billing address", onClick = { vm.openAddAddress(AddressTarget.BILLING) })
            }
        }
    }
}

/** One selectable saved address — a card, blue-edged when chosen (Checkout board). Shipping + billing. */
@Composable
private fun AddressPickRow(addr: SavedAddress, selected: Boolean, onSelect: () -> Unit) {
    ChoiceTile(selected = selected, enabled = true, onClick = onSelect, modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
            Text(addr.recipientName, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium))
            addr.label?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
            }
            if (addr.isDefault) Text("Default", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text(addr.formatSummary(), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** "12 Lygon St, Carlton VIC 3053" — the board's one-line address. */
private fun SavedAddress.shortSummary(): String = buildString {
    append(line1)
    line2?.takeIf { it.isNotBlank() }?.let { append(", ").append(it) }
    append(", ").append(city).append(" ").append(postalCode)
}

private fun SavedAddress.formatSummary(): String = buildString {
    append(line1)
    line2?.takeIf { it.isNotBlank() }?.let { append(", ").append(it) }
    append(", ").append(city).append(" ").append(postalCode)
    append(", ").append(country)
}

/** "1,250" — grouped thousands. */
private fun formatPointsCount(n: Long): String = n.toString().reversed().chunked(3).joinToString(",").reversed()
