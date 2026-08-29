package com.effyshopping.customer.mobile.features.checkout.presentation

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
import com.effyshopping.customer.mobile.core.presentation.EffyPullToRefresh
import com.effyshopping.customer.mobile.core.presentation.money
import com.effyshopping.customer.mobile.features.checkout.domain.GetReceipt
import com.effyshopping.customer.mobile.features.checkout.domain.ArrivalEstimate
import com.effyshopping.customer.mobile.features.checkout.domain.OrderStage
import com.effyshopping.customer.mobile.features.checkout.domain.PaymentMethodSummary
import com.effyshopping.customer.mobile.features.checkout.domain.Receipt
import com.effyshopping.customer.mobile.features.checkout.domain.ReceiptItem
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.mobile.kit.ui.EffyPrimaryAction
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Checkbox
import androidx.compose.material3.OutlinedTextField
import androidx.compose.runtime.mutableStateMapOf

private sealed interface ReceiptUiState {
    data object Loading : ReceiptUiState
    data class Ready(val receipt: Receipt) : ReceiptUiState
    data object Pending : ReceiptUiState
}

private class ReceiptViewModel(private val orderId: String, private val getReceipt: GetReceipt) : ViewModel() {
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
) {
    val vm = viewModel(key = orderId) { ReceiptViewModel(orderId, container.getReceipt) }
    val state by vm.state.collectAsState()

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
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            when (val s = state) {
                ReceiptUiState.Loading -> CircularProgressIndicator(Modifier.padding(32.dp))
                ReceiptUiState.Pending -> {
                    Text("We’re confirming your payment", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Your order will appear in your order history shortly.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (onDone != null) EffyPrimaryAction(doneLabel ?: "Done", onClick = onDone)
                }
                is ReceiptUiState.Ready -> ReceiptBody(container, s.receipt, doneLabel, onDone)
            }
        }
        }
    }
}

@Composable
private fun ReceiptBody(
    container: AppContainer,
    receipt: Receipt,
    doneLabel: String?,
    onDone: (() -> Unit)?,
) {
    val savedIds by container.savedStore.saved.collectAsState()
    val scope = rememberCoroutineScope()

    // ── Confirmation ────────────────────────────────────────────────────────────────────────────
    StatusDot(
        tint = ReceiptStatusPalette.paidTint(),
        dot = ReceiptStatusPalette.paidDot(),
        label = if (receipt.paid) "Payment received" else "Order received",
    )
    Text(
        "Thank you",
        style = MaterialTheme.typography.headlineSmall,
        modifier = Modifier.padding(top = EffySpacing.s),
    )
    Text(
        "Order ${'$'}{receipt.orderNumber}",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )

    // ── When it arrives + how far along (FR-007 / FR-008) ───────────────────────────────────────
    ArrivalSection(receipt)

    HorizontalDivider(Modifier.padding(vertical = EffySpacing.md))

    // ── The document ────────────────────────────────────────────────────────────────────────────
    SectionLabel("Receipt")
    if (receipt.placedAt.isNotBlank()) {
        Text(
            receipt.placedAt,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.fillMaxWidth(),
        )
    }

    receipt.items.forEach { item ->
        ReceiptLine(
            item = item,
            currency = receipt.currency,
            saved = item.productId in savedIds,
            onToggleSaved = { wanted ->
                scope.launch { runCatching { container.toggleSaved(item.productId, wanted) } }
            },
        )
    }

    HorizontalDivider(Modifier.padding(vertical = EffySpacing.s))

    // ⚠ EVERY LINE MUST ADD UP (FR-004): items − discount + delivery = total = what was charged.
    SummaryRow("Items subtotal", money(receipt.itemSubtotalAmount, receipt.currency))
    // 027 FR-049: what the code took off, as computed at PAYMENT and stored on the order — so the
    // receipt explains itself even after the code has since changed or been disabled.
    if (receipt.discountAmount != null && receipt.discountAmount != "0.00") {
        SummaryRow(
            receipt.promoCode?.let { "Discount (${'$'}it)" } ?: "Discount",
            "−" + money(receipt.discountAmount, receipt.currency),
        )
    }
    // ⚠ 052 — PREVIOUSLY MISSING ENTIRELY, so the arithmetic did not close whenever delivery was
    // charged. A zero fee stays omitted: on a financial record "nothing" and "unknown" differ.
    if (receipt.deliveryFeeAmount != null && receipt.deliveryFeeAmount != "0.00") {
        SummaryRow("Delivery", money(receipt.deliveryFeeAmount, receipt.currency))
    }
    SummaryRow("Total paid", money(receipt.grandTotalAmount, receipt.currency), bold = true)

    // How it was paid (FR-006). Absent when never captured — omitted, never blanked.
    receipt.paymentMethod?.let { m ->
        Text(
            "Paid with " + paymentLabel(m),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.s),
        )
    }

    HorizontalDivider(Modifier.padding(vertical = EffySpacing.md))

    // ── Addresses ───────────────────────────────────────────────────────────────────────────────
    SectionLabel("Delivering to")
    Text(receipt.recipientName, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.fillMaxWidth())
    Text(
        receipt.addressLine,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.fillMaxWidth(),
    )

    SectionLabel("Billing", topPadding = EffySpacing.md)
    if (receipt.billingSameAsShipping) {
        Text(
            "Same as delivery",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.fillMaxWidth(),
        )
    } else {
        receipt.billingRecipientName?.let {
            Text(it, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.fillMaxWidth())
        }
        receipt.billingAddressLine?.let {
            Text(
                it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }

    // ── What this document is (FR-032) ──────────────────────────────────────────────────────────
    //
    // ⚠ NO ABN, no GST amount, and it does not call itself a tax invoice. Those are absent — not
    // blank, not placeholder — because the operator's identifiers are unsupplied and per-item GST
    // treatment is unmodelled (research R13). Saying what the document IS costs nothing and stops it
    // from looking like something it is not.
    Text(
        "This is a record of payment. Prices include GST where it applies. " +
            "Need a tax invoice? Ask us from Help.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.md),
    )

    // ⚠ THE RESERVED TAX-INVOICE BLOCK (052 FR-033/FR-034) — deliberately NOT RENDERED. It would sit
    // between the totals above and the addresses, showing the legal entity, the ABN, and the taxable /
    // GST-free / GST-included split. TWO prerequisites block it, NEITHER engineering work in this
    // slice (research R13): (1) the ABN is an unsupplied operator identifier, and (2) per-item GST
    // treatment is unmodelled — basic food is GST-free, so a grocery basket is a MIXED SUPPLY and the
    // "includes GST" shorthand is false for most orders. Supplying the ABN alone is not enough.

    // ── Who sold this (FR-030) ──────────────────────────────────────────────────────────────────
    //
    // ⚠ THE TRADING NAME AND THE CUSTOMER-FACING MAILBOX, AND NOTHING ELSE. No ABN, no legal entity
    // name, no registered address — those are operator-supplied and still unset, and FR-031 requires
    // their ABSENCE rather than a placeholder or a plausible-looking guess. The web surface reads the
    // same two values from `@effy/legal-content`; mobile has no access to that TypeScript package, so
    // the two constants below are the ONE place this app states them.
    Text(
        "Sold by Effy · hello@effyshopping.com",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.s),
    )

    // ── Send the receipt again (052 US4, FR-027) ────────────────────────────────────────────────
    // ⚠ NOTHING AT ALL when there are no refunds (FR-028) — not an empty section. The server omits
    // the fields entirely, so an unrefunded order renders exactly as it did before 055 (SC-011).
    if (receipt.refunds.isNotEmpty()) {
        RefundSection(receipt)
    }

    // ⚠ ONLY WHEN THE SERVER SAYS SO (FR-012). Never worked out here from `stage` — that is the
    // `summarizeFulfillment` mistake 052 deleted, and the cost here is a shopper offered a button
    // that refuses, or denied one that would have worked.
    if (receipt.cancellable) {
        CancelOrderRow(container, receipt.id)
    }

    ResendReceiptRow(container, receipt.id)

    // ⚠ 055 US3 — REPLACES "Get help" pointing at the generic 046 feedback form WITH NO ORDER
    // ATTACHED. A shopper describing a missing item landed in an inbox where nobody could see which
    // order they meant; the ask now arrives attached to it.
    //
    // ⚠ Only on a PAID order — there is nothing to refund on one that never went through, and the
    // request would sit in the queue with no possible outcome.
    if (receipt.paid) {
        RequestRefundRow(container, receipt)
    }

    if (onDone != null) {
        EffyPrimaryAction(
            doneLabel ?: "Keep shopping",
            onClick = onDone,
            modifier = Modifier.padding(top = EffySpacing.lg),
        )
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
@Composable
private fun StatusDot(tint: Color, dot: Color, label: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.xs),
        modifier = Modifier
            .background(tint, RoundedCornerShape(percent = 50))
            .padding(horizontal = EffySpacing.s, vertical = 6.dp),
    ) {
        Box(Modifier.size(6.dp).background(dot, CircleShape))
        Text(label, style = MaterialTheme.typography.labelMedium)
    }
}

/**
 * When the order arrives, and how far along it is.
 *
 * ⚠ DATES, NEVER TIMES (research R4). The platform has no delivery time window; an earlier draft of
 * this design showed a "5–8 pm" slot, which is a promise the business has not made.
 */
@Composable
private fun ArrivalSection(receipt: Receipt) {
    val arrival = receipt.arrivalEstimates.firstOrNull()
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.md),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column {
            Text(
                "Arriving",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(arrivalLabel(arrival), style = MaterialTheme.typography.titleMedium)
        }
        if (arrival != null && arrival.method == "same_day") {
            StatusDot(
                tint = ReceiptStatusPalette.sameDayTint(),
                dot = ReceiptStatusPalette.sameDayDot(),
                label = "Same-day",
            )
        }
    }
    Text(
        stageLabel(receipt.stage),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.xs),
    )
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
        // ⚠ Decoration only: a line with no picture is still a whole line (FR-003).
        Box(
            Modifier
                .size(48.dp)
                .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp)),
        )
        Column(Modifier.weight(1f)) {
            Text(item.productName, style = MaterialTheme.typography.bodyMedium)
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
    return m.last4?.let { "${'$'}nice ending ${'$'}it" } ?: nice
}

/**
 * The arrival, in the plainest words the DATA supports.
 *
 * ⚠ When there is no promise it SAYS SO. Inventing a date on a receipt would be a false fact on a
 * financial record.
 */
private fun arrivalLabel(a: ArrivalEstimate?): String {
    if (a == null) return "We'll confirm your delivery date"
    val from = a.promisedFrom ?: a.promisedTo ?: return "We'll confirm your delivery date"
    val to = a.promisedTo ?: from
    return if (from == to) from else "${'$'}from – ${'$'}to"
}

/** The customer-facing stage, in words. ⚠ Rendered, never recomputed (FR-008). */
private fun stageLabel(stage: OrderStage): String = when (stage) {
    OrderStage.Confirmed -> "Confirmed — we'll start preparing your order shortly."
    OrderStage.Packing -> "Being packed — we're gathering your items now."
    OrderStage.OnTheWay -> "On the way — your order is out for delivery."
    OrderStage.Delivered -> "Delivered — your order has arrived."
    // ⚠ A stage this build does not recognise must not assert progress it cannot justify.
    OrderStage.Unknown -> "We'll keep you posted on your order."
}

@Composable
private fun SummaryRow(label: String, value: String, bold: Boolean = false) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = if (bold) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = if (bold) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium)
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
private fun ResendReceiptRow(container: AppContainer, orderId: String) {
    var state by remember(orderId) { mutableStateOf<ResendUiState>(ResendUiState.Idle) }
    val scope = rememberCoroutineScope()

    Column(
        modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.md),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.xs),
    ) {
        TextButton(
            onClick = {
                state = ResendUiState.Sending
                scope.launch {
                    state = when (container.resendReceipt(orderId)) {
                        ResendReceiptResult.Queued -> ResendUiState.Sent
                        ResendReceiptResult.RateLimited -> ResendUiState.Message(
                            "We've already sent this a few times recently. Check your inbox and spam folder, then try again later.",
                        )
                        ResendReceiptResult.Unavailable -> ResendUiState.Message(
                            "We can't send a receipt for this order.",
                        )
                        ResendReceiptResult.Failed -> ResendUiState.Message(
                            "We couldn't send it just now. Please try again.",
                        )
                    }
                }
            },
            enabled = state !is ResendUiState.Sending && state !is ResendUiState.Sent,
            // ⚠ 48 dp is the constitution's minimum touch target, and 033 shipped a 32 dp control
            // under a comment claiming it cleared the minimum. Stated in the modifier, not in prose.
            modifier = Modifier.defaultMinSize(minHeight = 48.dp),
        ) {
            Text(
                when (state) {
                    is ResendUiState.Sending -> "Sending…"
                    is ResendUiState.Sent -> "Sent — check your inbox"
                    else -> "Send the receipt again"
                },
            )
        }
        (state as? ResendUiState.Message)?.let {
            Text(
                it.text,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
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
private fun CancelOrderRow(container: AppContainer, orderId: String) {
    var state by remember(orderId) { mutableStateOf<CancelUiState>(CancelUiState.Idle) }
    val scope = rememberCoroutineScope()

    Column(
        modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.md),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.xs),
    ) {
        when (val current = state) {
            is CancelUiState.Confirming -> {
                Text(
                    "Cancel this order? We'll refund everything you paid, including delivery, to your original payment method.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
                    TextButton(
                        onClick = {
                            state = CancelUiState.Cancelling
                            scope.launch {
                                state = when (val result = container.cancelOrder(orderId)) {
                                    is CancelOrderResult.Cancelled ->
                                        // ⚠ "on its way", never "refunded" — the bank has not moved it.
                                        CancelUiState.Done(
                                            "Your order is cancelled. ${'$'}{result.amount} is on its way back to you.",
                                        )
                                    CancelOrderResult.AlreadyBeingPrepared -> CancelUiState.Message(
                                        "Someone has already started preparing this order. Contact us and we'll see what we can do.",
                                    )
                                    CancelOrderResult.NotAllowed -> CancelUiState.Message(
                                        "We can't cancel this order. Contact us and we'll help.",
                                    )
                                    CancelOrderResult.Failed -> CancelUiState.Message(
                                        "We couldn't cancel it just now. Please try again, or contact us.",
                                    )
                                }
                            }
                        },
                        modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                    ) { Text("Yes, cancel it") }
                    TextButton(
                        onClick = { state = CancelUiState.Idle },
                        modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                    ) { Text("Keep my order") }
                }
            }
            is CancelUiState.Done -> Text(
                current.text,
                style = MaterialTheme.typography.bodyMedium,
            )
            else -> TextButton(
                onClick = { state = CancelUiState.Confirming },
                enabled = state !is CancelUiState.Cancelling,
                modifier = Modifier.defaultMinSize(minHeight = 48.dp),
            ) {
                Text(if (state is CancelUiState.Cancelling) "Cancelling…" else "Cancel this order")
            }
        }
        (state as? CancelUiState.Message)?.let {
            Text(
                it.text,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
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
                Text(refund.amount, style = MaterialTheme.typography.bodyMedium)
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
            Text(receipt.refundedTotal, style = MaterialTheme.typography.bodyMedium)
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text("You paid", style = MaterialTheme.typography.titleSmall)
            Text(receipt.amountPaidAfterRefunds, style = MaterialTheme.typography.titleSmall)
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

    Column(
        modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.md),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.xs),
    ) {
        when (val current = state) {
            is RequestUiState.Done -> Text(current.text, style = MaterialTheme.typography.bodyMedium)

            is RequestUiState.Composing, is RequestUiState.Sending, is RequestUiState.Error -> {
                OutlinedTextField(
                    value = message,
                    onValueChange = { message = it },
                    label = { Text("What went wrong?") },
                    placeholder = { Text("e.g. two cartons of milk were missing") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                )
                if (receipt.items.isNotEmpty()) {
                    Text(
                        "Which items, if it helps?",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = EffySpacing.xs),
                    )
                    receipt.items.forEach { item ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                // ⚠ 48 dp, the constitution's minimum touch target. 033 shipped a
                                // 32 dp control under a comment claiming it cleared the minimum.
                                .defaultMinSize(minHeight = 48.dp)
                                .toggleable(
                                    value = selected.containsKey(item.orderItemId),
                                    onValueChange = { on ->
                                        // ⚠ Keyed on the LINE id, never the product id — see the note
                                        // on ReceiptItem.orderItemId.
                                        if (on) selected[item.orderItemId] = item.quantity
                                        else selected.remove(item.orderItemId)
                                    },
                                ),
                        ) {
                            Checkbox(
                                checked = selected.containsKey(item.orderItemId),
                                onCheckedChange = null,
                            )
                            Text(
                                item.productName,
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.padding(start = EffySpacing.s),
                            )
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
                    TextButton(
                        enabled = message.isNotBlank() && state !is RequestUiState.Sending,
                        onClick = {
                            state = RequestUiState.Sending
                            scope.launch {
                                val input = RefundRequestInput(
                                    message = message.trim(),
                                    items = selected.map { (id, qty) -> RefundRequestItem(id, qty) },
                                )
                                state = when (container.requestRefund(receipt.id, input)) {
                                    RefundRequestResult.Received -> RequestUiState.Done(
                                        "Thanks — we've got it and we'll look into this order. " +
                                            "We'll be in touch about what happens next.",
                                    )
                                    RefundRequestResult.AlreadyOpen -> RequestUiState.Done(
                                        "You've already told us about this order — we're looking into it.",
                                    )
                                    RefundRequestResult.NotAllowed -> RequestUiState.Error(
                                        "We can't take a request for this order. Contact us and we'll help.",
                                    )
                                    RefundRequestResult.Failed -> RequestUiState.Error(
                                        "We couldn't send that just now. Please try again.",
                                    )
                                }
                            }
                        },
                        modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                    ) {
                        Text(if (state is RequestUiState.Sending) "Sending…" else "Send")
                    }
                    TextButton(
                        enabled = state !is RequestUiState.Sending,
                        onClick = { state = RequestUiState.Idle },
                        modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                    ) { Text("Cancel") }
                }
                (state as? RequestUiState.Error)?.let {
                    Text(
                        it.text,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            RequestUiState.Idle -> TextButton(
                onClick = { state = RequestUiState.Composing },
                modifier = Modifier.defaultMinSize(minHeight = 48.dp),
            ) { Text("Something wrong with this order?") }
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
