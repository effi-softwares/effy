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
    ResendReceiptRow(container, receipt.id)

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
