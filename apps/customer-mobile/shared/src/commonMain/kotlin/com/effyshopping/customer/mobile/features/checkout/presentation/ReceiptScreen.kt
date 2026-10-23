package com.effyshopping.customer.mobile.features.checkout.presentation

import com.effyshopping.customer.mobile.resources.lucide_mail
import com.effyshopping.customer.mobile.resources.lucide_message_square
import com.effyshopping.customer.mobile.resources.lucide_x
import com.effyshopping.customer.mobile.resources.lucide_circle_check
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.core.presentation.EffyCheckboxRow
import com.effyshopping.customer.mobile.core.presentation.EffyField
import com.effyshopping.customer.mobile.core.presentation.EffySheet
import com.effyshopping.customer.mobile.core.presentation.EffyConfirmSheet
import com.effyshopping.customer.mobile.core.presentation.EffyInlineError
import com.effyshopping.customer.mobile.core.presentation.EffyRowIcon
import com.effyshopping.customer.mobile.core.presentation.EffyNavRow
import com.effyshopping.customer.mobile.core.presentation.EffyNotice
import androidx.compose.foundation.layout.height
import androidx.compose.ui.draw.clip
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import com.effyshopping.customer.mobile.core.presentation.ProductImage
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.customer.mobile.core.presentation.EffyTextLink
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.customer.mobile.core.presentation.EffyRowSkeleton
import com.effyshopping.customer.mobile.core.presentation.EffySkeletonBlock
import com.effyshopping.customer.mobile.core.presentation.EffySuccessTick
import com.effyshopping.customer.mobile.core.presentation.EffyStatusKind
import com.effyshopping.customer.mobile.core.presentation.EffyStatusPill
import androidx.compose.foundation.layout.heightIn
import com.effyshopping.customer.mobile.features.checkout.domain.OrderDelivery
import com.effyshopping.customer.mobile.features.checkout.domain.OrderTracking
import androidx.compose.ui.platform.LocalUriHandler
import com.effyshopping.mobile.kit.live.LiveKind
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryWindowText
import com.effyshopping.customer.mobile.features.saved.domain.ToggleOutcome
import com.effyshopping.customer.mobile.features.saved.presentation.ListChooserSheet
import com.effyshopping.customer.mobile.features.deliveryinstructions.presentation.DeliveryInstructionsText
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.effyshopping.customer.mobile.features.checkout.domain.CancelOrderResult
import com.effyshopping.customer.mobile.features.checkout.domain.CustomerRefundState
import com.effyshopping.customer.mobile.features.checkout.domain.RefundRequestInput
import com.effyshopping.customer.mobile.features.checkout.domain.RefundRequestItem
import com.effyshopping.customer.mobile.features.checkout.domain.RefundRequestResult
import com.effyshopping.customer.mobile.features.checkout.domain.ResendReceiptResult
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.material3.TextButton
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.effyshopping.customer.mobile.features.saved.presentation.SaveControl
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.mobile.kit.ui.EffyPullToRefresh
import com.effyshopping.customer.mobile.core.presentation.money
import com.effyshopping.customer.mobile.features.checkout.domain.GetReceipt
import com.effyshopping.customer.mobile.features.checkout.domain.ArrivalEstimate
import com.effyshopping.customer.mobile.features.checkout.domain.OrderStage
import com.effyshopping.customer.mobile.features.checkout.domain.PaymentMethodSummary
import com.effyshopping.customer.mobile.features.checkout.domain.Receipt
import com.effyshopping.customer.mobile.features.checkout.domain.ReceiptItem
import com.effyshopping.mobile.design.EffySpacing
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Checkbox
import androidx.compose.runtime.mutableStateMapOf
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryType
import com.effyshopping.customer.mobile.core.presentation.EffyCard
import com.effyshopping.customer.mobile.core.presentation.EffyPinnedBar
import com.effyshopping.customer.mobile.core.presentation.EffySecondaryButton
import com.effyshopping.customer.mobile.core.presentation.EffySnackbarHost
import com.effyshopping.customer.mobile.resources.lucide_refresh_cw
import com.effyshopping.customer.mobile.resources.lucide_check
import com.effyshopping.customer.mobile.core.theme.EffyRoles
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Icon
import org.jetbrains.compose.resources.painterResource
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.border
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.semantics.semantics

private sealed interface ReceiptUiState {
    data object Loading : ReceiptUiState
    data class Ready(val receipt: Receipt) : ReceiptUiState
    data object Pending : ReceiptUiState
}

private class ReceiptViewModel(
    private val orderId: String,
    private val getReceipt: GetReceipt,
    /** 071 — "your orders changed, or the channel just (re)connected: read now". */
    private val liveChanges: Flow<Unit>,
) : ViewModel() {
    private val _state = MutableStateFlow<ReceiptUiState>(ReceiptUiState.Loading)
    val state: StateFlow<ReceiptUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            try {
                _state.value = ReceiptUiState.Ready(getReceipt(orderId))
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _state.value = ReceiptUiState.Pending
            }
        }
        // 071 — the order's progress changes while the shopper is looking at it; re-read quietly when
        // told. It is also what turns a `Pending` receipt into the real one the moment payment lands.
        viewModelScope.launch { liveChanges.collect { refresh() } }
    }

    /**
     * Re-read the receipt WITHOUT clearing the screen.
     *
     * ⚠ Worth having on this screen in particular: a receipt carries the order's fulfilment progress, which
     * changes while the shopper is looking at it — a shop receives it, picks it, marks it ready. It is also
     * the natural place to retry from when the receipt was still `Pending` (the webhook had not landed yet).
     */
    suspend fun refresh() {
        try {
            _state.value = ReceiptUiState.Ready(getReceipt(orderId))
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            // Keep what is on screen — including a Pending state, which is itself informative.
        }
    }
}

/**
 * The receipt (019 US3). Reads the WEBHOOK-AUTHORITATIVE order (R4) — ONE Effy order itemized by
 * product, NO shop identity (FR-029). A read failure/lag shows a "confirming" state.
 *
 * ── ⚠ This screen serves TWO destinations, and they are not the same screen ──────────────────────
 *
 * As `Receipt` it is the end of checkout: the stack was REPLACED to get here, so there is nothing
 * behind it, no back arrow, and the only way on is the action at the bottom.
 *
 * As `OrderDetail` it is opened from order history: it sits on top of the Orders tab, so it gets a
 * back arrow (supplied by the navigator — see `LocalNavBack`) and [onDone] is null, because a second
 * button that does exactly what the arrow does is noise.
 *
 * It previously rendered NEITHER an app bar nor a title in either role, so opening a past order gave
 * a shopper a bare wall of numbers with no heading and — since the tab bar hides above a tab root —
 * no visible way back at all.
 */
@Composable
fun ReceiptScreen(
    container: AppContainer,
    orderId: String,
    title: String,
    doneLabel: String? = null,
    onDone: (() -> Unit)? = null,
    /** 087 (Confirmation board) — "Track this order": this order's details, in the Orders tab. */
    onTrack: (() -> Unit)? = null,
    /** 087 (Order board) — after "Buy again", the snackbar's "View cart". */
    onViewCart: (() -> Unit)? = null,
) {
    val vm = viewModel(key = orderId) { ReceiptViewModel(orderId, container.getReceipt, container.live.changes(LiveKind.ORDERS)) }
    val state by vm.state.collectAsState()
    val scope = rememberCoroutineScope()
    val snackbarHost = remember { SnackbarHostState() }

    /**
     * Put this order back in the cart, and TELL the shopper what could not come (FR-035) — the same
     * report the Orders list gives. ⚠ Silently adding a subset is the one outcome they cannot detect.
     */
    fun buyAgain() {
        scope.launch {
            val outcome = container.reorderPastOrder(orderId)
            val message = when {
                outcome == null -> "We couldn’t reorder that just now."
                outcome.cart.lines.isEmpty() && outcome.skipped.isNotEmpty() -> "Nothing from that order is available right now."
                outcome.skipped.isEmpty() -> "Added to your cart."
                else -> {
                    val n = outcome.skipped.size
                    "Added to your cart. $n item${if (n == 1) "" else "s"} couldn’t be added."
                }
            }
            val added = outcome != null && outcome.cart.lines.isNotEmpty()
            val result = snackbarHost.showSnackbar(message, actionLabel = if (added && onViewCart != null) "View cart" else null)
            if (result == SnackbarResult.ActionPerformed) onViewCart?.invoke()
        }
    }

    Box(Modifier.fillMaxSize()) {
    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = title)
        EffyPullToRefresh(onRefresh = vm::refresh, modifier = Modifier.weight(1f).fillMaxWidth()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(EffySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
        ) {
            when (val s = state) {
                ReceiptUiState.Loading -> Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
                    EffySkeletonBlock(Modifier.fillMaxWidth().height(120.dp), radius = EffyStorefrontShape.lg)
                    repeat(4) { EffyRowSkeleton() }
                }
                ReceiptUiState.Pending -> Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
                    Text("We’re confirming your payment", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Your order will appear in your order history shortly.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                is ReceiptUiState.Ready -> ReceiptBody(container, s.receipt, confirmation = onDone != null)
            }
        }
        }

        // 087 — the way on is PINNED (Confirmation / Order boards): "Track this order" + "Keep
        // shopping" at the end of checkout; "Buy again" on a past order.
        val ready = state is ReceiptUiState.Ready
        if (onDone != null) {
            EffyPinnedBar {
                if (onTrack != null && ready) EffyPrimaryButton("Track this order", onClick = onTrack)
                if (onTrack != null && ready) EffySecondaryButton(doneLabel ?: "Keep shopping", onClick = onDone)
                else EffyPrimaryButton(doneLabel ?: "Keep shopping", onClick = onDone)
            }
        } else if (ready) {
            EffyPinnedBar {
                EffyPrimaryButton(
                    "Buy again",
                    onClick = ::buyAgain,
                    leading = { Icon(painterResource(Res.drawable.lucide_refresh_cw), contentDescription = null, modifier = Modifier.size(18.dp)) },
                )
            }
        }
    }
    EffySnackbarHost(snackbarHost, modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 96.dp))
    }
}

@Composable
private fun ReceiptBody(
    container: AppContainer,
    receipt: Receipt,
    /** The end of checkout (Confirmation board), not a past order opened from history (Order board). */
    confirmation: Boolean,
) {
    val savedIds by container.savedStore.saved.collectAsState()
    val scope = rememberCoroutineScope()
    // 068: the list chooser, for a line whose product is in a list the shopper named.
    var chooserFor by remember { mutableStateOf<String?>(null) }
    chooserFor?.let { productId ->
        ListChooserSheet(container = container, productId = productId, onDismiss = { chooserFor = null })
    }

    // ── Confirmation (Confirmation board) vs details (Order board) ──────────────────────────────
    // ⚠ 087: "Thank you" and the drawn tick belong to the END OF CHECKOUT only. Order details said
    // "Thank you" every time a past order was opened.
    if (confirmation) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
            EffySuccessTick(modifier = Modifier.padding(top = EffySpacing.md))
            EffyStatusPill(if (receipt.paid) "Payment received" else "Order received", kind = EffyStatusKind.Done)
            Text("Thank you", style = MaterialTheme.typography.displayLarge)
            Text(
                ReceiptText.orderTitle(receipt.orderNumber) + if (receipt.paid) " · A receipt is on its way to your email" else "",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    } else {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(ReceiptText.orderTitle(receipt.orderNumber), style = MaterialTheme.typography.headlineSmall)
                Text(
                    ReceiptText.placedLine(receipt.placedAt, receipt.items.sumOf { it.quantity }),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            stagePill(receipt.stage)?.let { (word, kind) -> EffyStatusPill(word, kind) }
        }
    }

    // ── When it arrives + how far along (FR-007 / FR-008) ───────────────────────────────────────
    EffyCard(padding = EffySpacing.lg) {
        ArrivalSection(receipt)
        if (!confirmation) {
            Text(
                "Updates here as your order moves — no need to refresh.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = EffySpacing.xs),
            )
        }
        Spacer(Modifier.height(EffySpacing.md))
        OrderTracker(receipt.stage)
    }

    // ── The document ────────────────────────────────────────────────────────────────────────────
    EffyCard(padding = EffySpacing.lg) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
            Text("Receipt", style = MaterialTheme.typography.titleMedium)
            if (receipt.paid) EffyStatusPill("Paid", EffyStatusKind.Done)
            Spacer(Modifier.weight(1f))
        }
        // ── Who sold this (FR-030) ──────────────────────────────────────────────────────────────
        // ⚠ THE TRADING NAME AND THE CUSTOMER-FACING MAILBOX, AND NOTHING ELSE. No ABN, no legal
        // entity name, no registered address — those are operator-supplied and still unset, and FR-031
        // requires their ABSENCE rather than a placeholder. Mobile has no access to
        // `@effy/legal-content`, so this is the ONE place this app states them.
        // ── Send the receipt again (052 US4, FR-027) — beside it, as the board draws it.
        ResendReceiptLine(container, receipt.id, sellerLine = "Sold by Effy · hello@effyshopping.com")
        if (confirmation && receipt.placedAt.isNotBlank()) {
            Text(receipt.placedAt, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        receipt.items.forEach { item ->
            ReceiptLine(
                item = item,
                currency = receipt.currency,
                saved = item.productId in savedIds,
                onToggleSaved = { wanted ->
                    scope.launch {
                        val outcome = runCatching { container.toggleSaved(item.productId, wanted) }.getOrNull()
                        // ⚠ 068 FR-020: in a list the shopper named, so the tap removed nothing.
                        if (outcome == ToggleOutcome.OPEN_CHOOSER) chooserFor = item.productId
                    }
                },
            )
        }

        HorizontalDivider(Modifier.padding(vertical = EffySpacing.s), color = MaterialTheme.colorScheme.outlineVariant)

        // ⚠ EVERY LINE MUST ADD UP (FR-004): items − discount + delivery = total = what was charged.
        SummaryRow("Items subtotal", money(receipt.itemSubtotalAmount, receipt.currency))
        // 027 FR-049: what the code took off, as computed at PAYMENT and stored on the order.
        // 094 — one row per promotion as sold; an order from before 094 has one code.
        val sold = receipt.promotions.filter { it.goodsAmount != "0.00" }
        if (sold.isNotEmpty()) {
            sold.forEach { p ->
                SummaryRow(
                    if (p.code != null) "${p.headline} (${p.code})" else p.headline,
                    "−" + money(p.goodsAmount, receipt.currency),
                    valueColor = EffyRoles.brand,
                )
            }
        } else if (receipt.discountAmount != null && receipt.discountAmount != "0.00") {
            SummaryRow(
                ReceiptText.discountLabel(receipt.promoCode),
                "−" + money(receipt.discountAmount, receipt.currency),
                valueColor = EffyRoles.brand,
            )
        }
        receipt.deliveryDiscountAmount?.takeIf { it != "0.00" }?.let {
            SummaryRow("Delivery offer", "−" + money(it, receipt.currency), valueColor = EffyRoles.brand)
        }
        // ⚠ 052 — a zero fee stays omitted: on a financial record "nothing" and "unknown" differ.
        // 077 — an order placed since the fee engine shows the lines it was SOLD with, in the shared
        // words; a free delivery is shown as what was waived. Before 077, the single row.
        val feeLines = receipt.deliveryFee?.lines.orEmpty()
        if (feeLines.isNotEmpty()) {
            feeLines.forEach { line ->
                val saving = line.amount.startsWith("-")
                SummaryRow(
                    DeliveryFeeWords.label(line.kind),
                    if (saving) "−" + money(line.amount.removePrefix("-"), receipt.currency) else money(line.amount, receipt.currency),
                    valueColor = if (saving) EffyRoles.brand else Color.Unspecified,
                )
            }
        } else if (receipt.deliveryFeeAmount != null && receipt.deliveryFeeAmount != "0.00") {
            SummaryRow("Delivery", money(receipt.deliveryFeeAmount, receipt.currency))
        }
        SummaryRow("Total paid", money(receipt.grandTotalAmount, receipt.currency), bold = true)

        // 074 — points are a way of PAYING: a line beside the card's, never a discount above the total.
        // One sentence, as the Confirmation board writes it: points, then the card.
        val split = receipt.paymentSplit
        val method = receipt.paymentMethod?.let { paymentLabel(it) }
        val paidWith = when {
            split != null -> "Paid with ${split.pointsUsed.toString().reversed().chunked(3).joinToString(",").reversed()} Effy points " +
                "(${money(split.pointsAmount, receipt.currency)})" +
                (if (split.cardAmount != "0.00") " and ${money(split.cardAmount, receipt.currency)} by card" else "") +
                (if (method != null && split.cardAmount != "0.00") " · $method" else "")
            // How it was paid (FR-006). Absent when never captured — omitted, never blanked.
            method != null -> "Paid with $method"
            else -> null
        }
        paidWith?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = EffySpacing.s))
        }

        // ── What this document is (FR-032) ──────────────────────────────────────────────────────
        // ⚠ NO ABN, no GST amount, and it does not call itself a tax invoice (research R13). The
        // reserved tax-invoice block (052 FR-033/FR-034) is deliberately NOT RENDERED: the ABN is an
        // unsupplied operator identifier and per-item GST treatment is unmodelled.
        Text(
            "This is a record of payment. Prices include GST where it applies. " +
                "Need a tax invoice? Ask us from Help.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = EffySpacing.s),
        )
    }

    // ── Addresses ───────────────────────────────────────────────────────────────────────────────
    EffyCard(padding = EffySpacing.lg) {
        SectionLabel("Delivering to")
        Text("${receipt.recipientName} · ${receipt.addressLine}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)

        // 066 — ONLY when the shopper said something. No heading and no "none given" otherwise (SC-003).
        receipt.deliveryInstructions?.takeUnless { it.isEmpty }?.let { said ->
            SectionLabel("Delivery instructions", topPadding = EffySpacing.md)
            DeliveryInstructionsText(handover = said.handover, note = said.note)
        }

        if (!confirmation) {
            SectionLabel("Billing", topPadding = EffySpacing.md)
            if (receipt.billingSameAsShipping) {
                Text("Same as delivery", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                Text(
                    listOfNotNull(receipt.billingRecipientName, receipt.billingAddressLine).joinToString(" · "),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }

    // 096 US7 — the delivery note, on a paid order seen from history (not at the end of checkout).
    if (receipt.paid && !confirmation) {
        EffyCard(padding = EffySpacing.lg) { OrderDocumentsSection(container, receipt.id) }
    }

    // ⚠ NOTHING AT ALL when there are no refunds (FR-028) — not an empty section.
    if (receipt.refunds.isNotEmpty()) {
        EffyCard(padding = EffySpacing.lg) { RefundSection(receipt) }
    }

    // ⚠ 055 US3 — the ask arrives attached to THIS order. Only on a PAID order.
    if (receipt.paid && !confirmation) {
        RequestRefundRow(container, receipt)
    }

    // ⚠ ONLY WHEN THE SERVER SAYS SO (FR-012). Never worked out here from `stage`.
    if (receipt.cancellable) {
        CancelOrderRow(container, currency = receipt.currency, orderId = receipt.id)
    }
}

/** The order's stage as a pill (Order board header). Nothing for a stage this build does not know. */
private fun stagePill(stage: OrderStage): Pair<String, EffyStatusKind>? = when (stage) {
    OrderStage.Confirmed -> "Confirmed" to EffyStatusKind.InProgress
    OrderStage.Packing -> "Being packed" to EffyStatusKind.InProgress
    OrderStage.OnTheWay -> "On the way" to EffyStatusKind.InProgress
    OrderStage.Delivered -> "Delivered" to EffyStatusKind.Done
    OrderStage.Unknown -> null
}

/**
 * The progress tracker (Order / Confirmation boards): Confirmed → Being packed → On the way →
 * Delivered, each with its line. Reached steps are Effy green with a tick, the current one is ringed in
 * blue. ⚠ The stage is the SERVER's (FR-008) — rendered, never recomputed. An unknown stage draws every
 * step as not yet reached rather than asserting progress it cannot justify.
 */
@Composable
private fun OrderTracker(stage: OrderStage) {
    val steps = listOf(
        "Confirmed" to "We've received your payment",
        "Being packed" to "Your order is being picked",
        "On the way" to "Out for delivery",
        "Delivered" to "Your order has arrived",
    )
    val current = when (stage) {
        OrderStage.Confirmed -> 0
        OrderStage.Packing -> 1
        OrderStage.OnTheWay -> 2
        OrderStage.Delivered -> 3
        OrderStage.Unknown -> -1
    }
    Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}) {
        steps.forEachIndexed { i, (title, line) ->
            val done = i < current || (i == current && i == steps.lastIndex)
            val isCurrent = i == current && !done
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
                Column(Modifier.width(24.dp).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        Modifier
                            .size(22.dp)
                            .clip(CircleShape)
                            .background(if (done) EffyRoles.brand else MaterialTheme.colorScheme.background)
                            .border(
                                2.dp,
                                when {
                                    done -> EffyRoles.brand
                                    isCurrent -> MaterialTheme.colorScheme.primary
                                    else -> MaterialTheme.colorScheme.outline
                                },
                                CircleShape,
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        when {
                            done -> Icon(painterResource(Res.drawable.lucide_check), contentDescription = null, tint = EffyRoles.brandForeground, modifier = Modifier.size(13.dp))
                            isCurrent -> Box(Modifier.size(8.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary))
                        }
                    }
                    if (i < steps.lastIndex) {
                        Box(
                            Modifier
                                .width(2.dp)
                                .weight(1f)
                                .background(if (i < current) EffyRoles.brand else MaterialTheme.colorScheme.outline),
                        )
                    }
                }
                Column(Modifier.padding(start = EffySpacing.md, bottom = if (i < steps.lastIndex) EffySpacing.md else 0.dp)) {
                    Text(
                        title,
                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = if (i <= current) FontWeight.SemiBold else FontWeight.Normal),
                        color = if (i <= current) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(line, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

/** A section heading, left-aligned across the full width (the column centres its children). */
@Composable
private fun SectionLabel(text: String, topPadding: androidx.compose.ui.unit.Dp = 0.dp) {
    Text(
        text,
        style = MaterialTheme.typography.titleSmall,
        modifier = Modifier.fillMaxWidth().padding(top = topPadding),
    )
}

/**
 * The paid indicator.
 *
 * ⚠ The DOT carries the colour and the LABEL stays on the ramp (FR-015). Remove the hue and this
 * still reads correctly, which is what keeps the bounded palette inside Principle V.
 */

/**
 * When the order arrives, and how far along it is.
 *
 * ⚠ DATES, NEVER TIMES (research R4). The platform has no delivery time window; an earlier draft of
 * this design showed a "5–8 pm" slot, which is a promise the business has not made.
 */
@Composable
private fun ArrivalSection(receipt: Receipt) {
    // 079 — a courier delivers: no window and no day to state. Who delivers, and the ESTIMATE the
    // order was sold, in the words the website prints. ⚠ Never the arrival estimates — a courier
    // order has none, and "We'll confirm your delivery date" would be a promise nobody made.
    val delivery = receipt.delivery
    if (delivery.type == DeliveryType.COURIER && delivery.courierEstimate != null) {
        val (partner, estimate) = DeliveryTypeWords.courierLines(delivery.courierEstimate)
        Column(modifier = Modifier.fillMaxWidth()) {
            Text(
                DeliveryTypeWords.COURIER,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(partner, style = MaterialTheme.typography.titleMedium)
            Text(estimate, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            // 080 Q8 — one consignment: its tracking link; several: each parcel's tracking by email.
            // ⚠ Never a count.
            when (val t = delivery.tracking) {
                is OrderTracking.Link -> {
                    val uriHandler = LocalUriHandler.current
                    EffyTextLink(trackingLinkLabel(t), onClick = { uriHandler.openUri(t.url) })
                }
                OrderTracking.ByEmail -> Text(DeliveryTypeWords.TRACKING_BY_EMAIL, style = MaterialTheme.typography.bodyMedium)
                null -> Unit
            }
            MovedNote(delivery)
        }
        return
    }
    val arrival = receipt.arrivalEstimates.firstOrNull()
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f, fill = false)) {
            Text(
                DeliveryTypeWords.EFFY,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(arrivalLabel(arrival), style = MaterialTheme.typography.titleMedium)
            MovedNote(delivery)
        }
        if (arrival != null && arrival.method == "same_day") {
            EffyStatusPill("Same-day", kind = EffyStatusKind.InProgress)
        }
    }
}

/**
 * 081 — Effy moved the order to courier delivery (or back): what changed, and what the customer
 * received, in the one wording (`DeliveryTypeWords.movedLines`, pinned to the website's). ⚠ Never why.
 */
@Composable
private fun MovedNote(delivery: OrderDelivery?) {
    for (line in DeliveryTypeWords.movedLines(delivery?.moved)) {
        Text(line, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = EffySpacing.xs))
    }
}

/** One item row: image, name, unit price × qty, line total, and the save control (033 FR-008). */
@Composable
private fun ReceiptLine(
    item: ReceiptItem,
    currency: String,
    saved: Boolean,
    onToggleSaved: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = EffySpacing.s),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
    ) {
        // 087 — the item's picture (it was a grey box though `imageUrl` was on the line since 052).
        // ⚠ Decoration only: a line with no picture is still a whole line (FR-003).
        Box(Modifier.size(56.dp).clip(EffyStorefrontShape.card).background(EffySurface.tint)) {
            ProductImage(item.imageUrl, item.productName, modifier = Modifier.fillMaxSize())
        }
        Column(Modifier.weight(1f)) {
            Text(item.productName, style = MaterialTheme.typography.bodyMedium)
            // 098 — the size as it was sold.
            item.variantLabel?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            // ⚠ The unit price. It has been on the wire since 019 and this screen never showed it —
            // it is what makes a line checkable rather than merely stated (FR-003).
            Text(
                money(item.unitPriceAmount, currency) + " each · Qty " + item.quantity,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(money(item.lineSubtotalAmount, currency), style = MaterialTheme.typography.bodyMedium)
        // 033 FR-008: save from a past order. ⚠ The product may have been archived since, so the save
        // can 404 — runCatching swallows it and the control simply does not stick.
        SaveControl(saved = saved, onToggle = onToggleSaved)
    }
}

/** "Visa ending 4242" / "Klarna" — never any card field beyond last4 (051). */
private fun paymentLabel(m: PaymentMethodSummary): String {
    val base = m.brand?.replace('_', ' ')
        ?: if (m.type == "pay_over_time") "pay over time" else m.type
    val nice = base.replaceFirstChar { it.uppercase() }
    return ReceiptText.cardLabel(nice, m.last4)
}

/**
 * The arrival, in the plainest words the DATA supports.
 *
 * ⚠ THE WORDING IS [DeliveryWindowText]'s (069) — the Kotlin twin of the function the web page and the
 * emailed receipt call, tested against the same fixture. This used to print the raw ISO date.
 *
 * ⚠ When there is no promise it SAYS SO. Inventing a date on a receipt would be a false fact on a
 * financial record; every order placed before 069 reads that line.
 */
@OptIn(kotlin.time.ExperimentalTime::class)
internal fun arrivalLabel(a: ArrivalEstimate?): String {
    if (a == null) return DeliveryWindowText.UNCONFIRMED
    return DeliveryWindowText.formatArrival(
        promisedFrom = a.promisedFrom,
        promisedTo = a.promisedTo,
        windowStart = a.windowStart,
        windowEnd = a.windowEnd,
        nowEpochMillis = kotlin.time.Clock.System.now().toEpochMilliseconds(),
    )
}

@Composable
private fun SummaryRow(label: String, value: String, bold: Boolean = false, valueColor: Color = Color.Unspecified) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = if (bold) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium, color = if (bold) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = if (bold) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium, color = valueColor)
    }
}

/**
 * "Send the receipt again" (052 US4).
 *
 * ⚠ EVERY OUTCOME IS SAID OUT LOUD, refusals included. A rate-limited tap that silently does nothing
 * is indistinguishable from a broken button — the failure 033 recorded when a guest cap refused
 * without telling anyone. The row reports success, the limit, and failure in the shopper's own terms.
 */
@Composable
private fun ResendReceiptLine(container: AppContainer, orderId: String, sellerLine: String) {
    var state by remember(orderId) { mutableStateOf<ResendUiState>(ResendUiState.Idle) }
    val scope = rememberCoroutineScope()

    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(EffySpacing.xs)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(sellerLine, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            // 087 (Order board): "Send again" beside the seller line. ⚠ 48dp tall — the minimum target,
            // stated in the modifier (033 once shipped a 32dp control under a comment claiming otherwise).
            EffyTextLink(
                when (state) {
                    is ResendUiState.Sending -> "Sending…"
                    is ResendUiState.Sent -> "Sent"
                    else -> "Send again"
                },
                enabled = state !is ResendUiState.Sending && state !is ResendUiState.Sent,
                modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                onClick = {
                    state = ResendUiState.Sending
                    scope.launch {
                        state = when (container.resendReceipt(orderId)) {
                            ResendReceiptResult.Queued -> ResendUiState.Sent
                            ResendReceiptResult.RateLimited -> ResendUiState.Message(
                                "We've already sent this a few times recently. Check your inbox and spam folder, then try again later.",
                            )
                            ResendReceiptResult.Unavailable -> ResendUiState.Message("We can't send a receipt for this order.")
                            ResendReceiptResult.Failed -> ResendUiState.Message("We couldn't send it just now. Please try again.")
                        }
                    }
                },
            )
        }
        // ⚠ EVERY OUTCOME IS SAID OUT LOUD, refusals included — a silent rate-limited tap reads as broken.
        when (val st = state) {
            is ResendUiState.Sent -> Text("Sent — check your inbox", style = MaterialTheme.typography.bodySmall, color = EffyRoles.brand)
            is ResendUiState.Message -> Text(st.text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            else -> Unit
        }
    }
}

private sealed interface ResendUiState {
    data object Idle : ResendUiState
    data object Sending : ResendUiState
    data object Sent : ResendUiState
    data class Message(val text: String) : ResendUiState
}


/**
 * Cancelling an order (055 US2, FR-012).
 *
 * ⚠ IT CONFIRMS FIRST, because this returns money and empties an order the shopper may have spent
 * time building. The confirmation NAMES WHAT HAPPENS rather than asking "are you sure?", which tells
 * nobody anything.
 *
 * ⚠ AND IT SAYS A REFUND IS COMING. Cancelling *is* refunding on this platform — the money was taken
 * when the order was paid (research R3) — and a shopper who believes nothing was charged will not go
 * looking for a refund that has not arrived.
 *
 * ⚠ THE REFUSAL POINTS AT A HUMAN. A shop can start preparing between this screen loading and the
 * tap, and staff can still cancel after that (FR-018) — so the wording must never say the order can
 * never be cancelled, or a shopper who would have rung up simply gives up.
 */
@Composable
private fun CancelOrderRow(container: AppContainer, orderId: String, currency: String) {
    var state by remember(orderId) { mutableStateOf<CancelUiState>(CancelUiState.Idle) }
    val scope = rememberCoroutineScope()

    // 087 (Order board): a row that opens a confirm SHEET with its actions pinned — no inline buttons,
    // no dialog. The sheet names what happens (refund of everything) rather than asking "are you sure?".
    when (val current = state) {
        is CancelUiState.Done -> EffyNotice(current.text, icon = Res.drawable.lucide_circle_check, positive = true)
        else -> EffyNavRow(
            if (state is CancelUiState.Cancelling) "Cancelling…" else "Cancel this order",
            leading = { EffyRowIcon(Res.drawable.lucide_x) },
            onClick = { if (state !is CancelUiState.Cancelling) state = CancelUiState.Confirming },
            showChevron = false,
            divider = false,
        )
    }
    (state as? CancelUiState.Message)?.let { EffyInlineError(it.text) }

    if (state is CancelUiState.Confirming || state is CancelUiState.Cancelling) {
        EffyConfirmSheet(
            title = "Cancel this order?",
            body = "We'll refund everything you paid, including delivery, to your original payment method.",
            confirmLabel = "Yes, cancel it",
            cancelLabel = "Keep my order",
            icon = Res.drawable.lucide_x,
            destructive = true,
            busy = state is CancelUiState.Cancelling,
            onDismiss = { if (state !is CancelUiState.Cancelling) state = CancelUiState.Idle },
            onConfirm = {
                state = CancelUiState.Cancelling
                scope.launch {
                    state = when (val result = container.cancelOrder(orderId)) {
                        // ⚠ "on its way", never "refunded" — the bank has not moved it.
                        is CancelOrderResult.Cancelled -> CancelUiState.Done(ReceiptText.cancelled(result.amount, currency))
                        CancelOrderResult.AlreadyBeingPrepared -> CancelUiState.Message(
                            "Someone has already started preparing this order. Contact us and we'll see what we can do.",
                        )
                        CancelOrderResult.NotAllowed -> CancelUiState.Message("We can't cancel this order. Contact us and we'll help.")
                        CancelOrderResult.Failed -> CancelUiState.Message("We couldn't cancel it just now. Please try again, or contact us.")
                    }
                }
            },
        )
    }
}

private sealed interface CancelUiState {
    data object Idle : CancelUiState
    data object Confirming : CancelUiState
    data object Cancelling : CancelUiState
    data class Done(val text: String) : CancelUiState
    data class Message(val text: String) : CancelUiState
}


/**
 * What happened to the shopper's money (055 US5, FR-023) — the mobile half of customer-web's
 * `RefundBlock`, at parity.
 *
 * ⚠ IT SITS ALONGSIDE THE RECEIPT AND NEVER INSIDE IT (FR-024). What was charged is a historical
 * record; a document that silently rewrote itself after a refund could not be reconciled against a
 * bank statement, which is the one thing a receipt is for.
 *
 * ⚠ NO COLOUR CARRIES MEANING. A refund that had a problem is marked by the words, not by a tint a
 * colour-blind reader loses entirely.
 */
@Composable
private fun RefundSection(receipt: Receipt) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.xs),
    ) {
        Text(
            if (receipt.fullyRefunded) "This order was refunded" else "Refunds on this order",
            style = MaterialTheme.typography.titleSmall,
        )

        receipt.refunds.forEach { refund ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.xs),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    refundStateLabel(refund.state),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(money(refund.amount, receipt.currency), style = MaterialTheme.typography.bodyMedium)
            }
        }

        // ⚠ The arithmetic a shopper checks against their bank. 051 and 052 EACH shipped a receipt
        // whose lines did not add up, and a refund puts a second set of figures on the same document.
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.s),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                "Refunded",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(money(receipt.refundedTotal, receipt.currency), style = MaterialTheme.typography.bodyMedium)
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text("You paid", style = MaterialTheme.typography.titleSmall)
            Text(money(receipt.amountPaidAfterRefunds, receipt.currency), style = MaterialTheme.typography.titleSmall)
        }

        // ⚠ THE PUBLISHED POLICY'S OWN SENTENCE, and the SAME one customer-web renders (FR-026).
        // Three places describing this timing would drift; the one that drifts is whichever a
        // developer edits without opening the legal document.
        //
        // ⚠ IT PROMISES NO CREDIT LINE. A refund issued soon after payment often appears as a
        // REVERSAL — the original charge simply vanishes and no separate credit ever shows up
        // (research R2). A shopper told to look for a credit will not find one, and will contact us
        // about money that has already been returned.
        Text(
            "Refunds go back to the card or payment method you paid with, usually within a few " +
                "business days — though when it appears depends on your bank. It may show as the " +
                "original charge disappearing rather than as a separate credit.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = EffySpacing.s),
        )
    }
}

/**
 * ⚠ FIVE INTERNAL STATES ARRIVE AS THREE, and none of them says why. "Your bank rejected the refund"
 * is staff information: a shopper cannot act on it, and surfacing it invites them to argue with a
 * message that will not change (FR-026).
 */
internal fun refundStateLabel(state: CustomerRefundState): String = when (state) {
    CustomerRefundState.OnItsWay -> "On its way back to you"
    CustomerRefundState.Completed -> "Refunded"
    CustomerRefundState.ThereWasAProblem -> "There was a problem — we're looking into it"
}


/**
 * Asking for a refund (055 US3, FR-005r) — the mobile half of customer-web's `RequestRefund`.
 *
 * ⚠ IT MOVES NO MONEY AND MUST NOT READ AS A DECISION. The confirmation says the ask was received,
 * never that a refund is coming: a person decides, and promising one here would be a commitment
 * nobody has made.
 *
 * ⚠ NAMING ITEMS IS OPTIONAL. A shopper who cannot point at one line — "the whole thing arrived
 * warm" — must still be able to ask, or they are pushed back to the generic inbox this replaces.
 */
@Composable
private fun RequestRefundRow(container: AppContainer, receipt: Receipt) {
    var state by remember(receipt.id) { mutableStateOf<RequestUiState>(RequestUiState.Idle) }
    var message by remember(receipt.id) { mutableStateOf("") }
    val selected = remember(receipt.id) { mutableStateMapOf<String, Int>() }
    val scope = rememberCoroutineScope()

    // 087 (Order board): the row opens a full-height SHEET — message, optional items, pinned Send.
    when (val current = state) {
        is RequestUiState.Done -> EffyNotice(current.text, icon = Res.drawable.lucide_circle_check, positive = true)
        // 087 (Order board): a card that says what it is for, with its one action.
        else -> EffyCard(padding = EffySpacing.lg) {
            Text("Something wrong with this order?", style = MaterialTheme.typography.titleMedium)
            Text(
                "Tell us what happened and we'll sort it out.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = EffySpacing.md),
            )
            EffySecondaryButton(
                "Report a problem",
                onClick = { state = RequestUiState.Composing },
                leading = { Icon(painterResource(Res.drawable.lucide_message_square), contentDescription = null, modifier = Modifier.size(18.dp)) },
            )
        }
    }

    val composing = state is RequestUiState.Composing || state is RequestUiState.Sending || state is RequestUiState.Error
    if (composing) {
        val sending = state is RequestUiState.Sending
        EffySheet(
            title = "What went wrong?",
            onDismiss = { state = RequestUiState.Idle },
            fullHeight = true,
            dirty = message.isNotBlank() && !sending,
            busy = sending,
            primaryLabel = if (sending) "Sending…" else "Send",
            primaryEnabled = message.isNotBlank() && !sending,
            primaryLoading = sending,
            onPrimary = {
                state = RequestUiState.Sending
                scope.launch {
                    val input = RefundRequestInput(
                        message = message.trim(),
                        items = selected.map { (id, qty) -> RefundRequestItem(id, qty) },
                    )
                    state = when (container.requestRefund(receipt.id, input)) {
                        RefundRequestResult.Received -> RequestUiState.Done(
                            "Thanks — we've got it and we'll look into this order. We'll be in touch about what happens next.",
                        )
                        RefundRequestResult.AlreadyOpen -> RequestUiState.Done("You've already told us about this order — we're looking into it.")
                        RefundRequestResult.NotAllowed -> RequestUiState.Error("We can't take a request for this order. Contact us and we'll help.")
                        RefundRequestResult.Failed -> RequestUiState.Error("We couldn't send that just now. Please try again.")
                    }
                }
            },
        ) {
            EffyField(
                label = "Tell us what happened",
                value = message,
                onValueChange = { message = it },
                placeholder = "e.g. two cartons of milk were missing",
                singleLine = false,
            )
            if (receipt.items.isNotEmpty()) {
                // ⚠ NAMING ITEMS IS OPTIONAL — "the whole thing arrived warm" must still be askable.
                Text("Which items, if it helps?", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                receipt.items.forEach { item ->
                    // ⚠ Keyed on the LINE id, never the product id — see ReceiptItem.orderItemId.
                    EffyCheckboxRow(
                        label = item.productName,
                        checked = selected.containsKey(item.orderItemId),
                        onCheckedChange = { on -> if (on) selected[item.orderItemId] = item.quantity else selected.remove(item.orderItemId) },
                    )
                }
            }
            (state as? RequestUiState.Error)?.let { EffyInlineError(it.text) }
        }
    }
}

private sealed interface RequestUiState {
    data object Idle : RequestUiState
    data object Composing : RequestUiState
    data object Sending : RequestUiState
    data class Done(val text: String) : RequestUiState
    data class Error(val text: String) : RequestUiState
}

/** "Track your parcel with Test Courier" — the website's words, with the courier's name when given. */
internal fun trackingLinkLabel(t: OrderTracking.Link): String =
    if (t.courierName.isBlank()) DeliveryTypeWords.TRACK_PARCEL else "${DeliveryTypeWords.TRACK_PARCEL} with ${t.courierName}"


/**
 * The receipt's own sentences, as pure functions (087 T085).
 *
 * ⚠ WHY THESE EXIST: four of them were written `"Order ${'$'}{receipt.orderNumber}"` — an ESCAPED
 * dollar, which Kotlin prints literally. Every receipt said "Order ${receipt.orderNumber}" instead of the
 * number, and the cancel confirmation printed the template instead of the amount. Pulled out here so
 * `ReceiptTextTest` can render each one and fail on any `$`-template left in the output.
 */
internal object ReceiptText {
    fun orderTitle(orderNumber: String): String = "Order $orderNumber"

    /** "Placed 12 October 2026 at 9:14 am · 11 items" — the date is left out when unknown. */
    fun placedLine(placedAt: String, itemCount: Int): String {
        val items = "$itemCount item${if (itemCount == 1) "" else "s"}"
        return if (placedAt.isBlank()) items else "Placed $placedAt · $items"
    }

    fun discountLabel(promoCode: String?): String = promoCode?.let { "Discount ($it)" } ?: "Discount"

    fun cardLabel(brand: String, last4: String?): String = last4?.let { "$brand ending $it" } ?: brand

    /** ⚠ "on its way", never "refunded" — the bank has not moved it yet. */
    fun cancelled(amount: String, currency: String): String =
        "Your order is cancelled. ${money(amount, currency)} is on its way back to you."
}
