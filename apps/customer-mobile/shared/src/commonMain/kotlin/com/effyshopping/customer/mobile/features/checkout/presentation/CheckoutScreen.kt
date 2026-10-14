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
import androidx.compose.material3.CircularProgressIndicator
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

/**
 * Checkout (019 US3, extended 021 delivery + 023 shipping/billing). Reached only when signed in.
 * Pre-selects the default saved address as SHIPPING (023 US1), lets the customer switch to another saved
 * address or add a new one inline (US2/US3) → per-package ANONYMOUS delivery options → a "Billing same as
 * shipping" toggle (US4) → pay.
 *
 * ⚠ 051: THIS SCREEN NO LONGER TAKES A PAYMENT. Pressing pay creates the order and its intent and then
 * hands over to Effy's own payment screen through [onProceedToPayment]; the provider's modal sheet is
 * gone. Checkout ends unpaid, which is why there is no receipt callback here any more.
 */
@Composable
fun CheckoutScreen(
    container: AppContainer,
    onProceedToPayment: () -> Unit,
    onBack: () -> Unit,
    /** 074 — points paid for everything; the order is placed. Open its receipt. */
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
            // Disarm FIRST. Navigating first and disarming second leaves the flag set for however long
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
        // 026: the app bar already names the screen — the duplicate H3 beneath it was the screen
        // saying "Checkout" twice, which the source never does.
        EffyAppBar(title = "Checkout", onBack = onBack)

        when (val s = state) {
            CheckoutUiState.Loading -> Column(Modifier.padding(EffySpacing.lg), verticalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
                repeat(3) { EffySkeletonBlock(Modifier.fillMaxWidth().height(110.dp), radius = EffyStorefrontShape.lg) }
            }

            is CheckoutUiState.Ready -> {
                val cart by container.cart.state.collectAsState()
                AddressAndPay(
                    s,
                    vm,
                    itemsTotal = cart.grandTotalAmount,
                    currency = cart.currency,
                    onNavigateLegal = { container.navigator.push(CustomerNavKey.LegalDocument(it)) },
                )
            }
        }
    }
}

/**
 * 087 (Checkout / Checkout-Courier boards): sectioned CARDS — address, delivery, points, billing — with
 * the order total and "Pay now" PINNED at the bottom (FR-022). Card layouts are the storefront pattern
 * (constitution v3.3.0): an address and a delivery window are discrete choosable objects.
 */
@Composable
private fun AddressAndPay(
    s: CheckoutUiState.Ready,
    vm: CheckoutViewModel,
    itemsTotal: String,
    currency: String,
    onNavigateLegal: (String) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
    Column(
        modifier = Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(EffySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.xl),
    ) {
        CheckoutSection("Delivery address") {
            if (s.addresses.isEmpty()) {
                // No saved address → a prompt that blocks pay (023 US1 scenario 3, FR-007).
                Text("Add a delivery address to continue.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                s.addresses.forEach { addr ->
                    AddressPickRow(addr, selected = addr.id == s.selectedId, onSelect = { vm.select(addr.id) })
                }
            }
            EffySecondaryButton("Add a new address", onClick = { vm.openAddAddress(AddressTarget.SHIPPING) })
        }

        // 066 — what the shopper tells the driver. Shown once there is an address for it to be about.
        if (s.selectedId != null) {
            Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
                DeliveryInstructionsField(draft = s.instructions, onChange = vm::setInstructions)
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

        // 047: delivery — serviceability + the GST-inclusive fee, shown BEFORE pay (no drip). The
        // server owns every fee (SC-004).
        DeliverySection(s, vm)

        // 074 — Effy points, only when the shopper has some.
        s.points?.let { points ->
            EffyGroup(caption = "Effy points") {
                EffySwitchRow(
                    label = "Use my Effy points",
                    supporting = "${formatPointsCount(points.usable)} points, worth \$${points.valueAmount}. Any rest is paid by card.",
                    checked = s.usePoints,
                    onCheckedChange = vm::setUsePoints,
                )
            }
        }

        BillingSection(s, vm)

        s.error?.let { EffyInlineError(it) }

        // Point-of-sale consent (045) — the purchase terms, at the moment of paying.
        LegalLinksText(
            "By placing your order you agree to our [Terms of Service](/legal/terms-of-service), " +
                "[Delivery Policy](/legal/delivery-policy) and [Refund & Returns Policy](/legal/refunds-returns).",
            onNavigateSlug = onNavigateLegal,
        )
    }

    val billingReady = s.billingSameAsShipping || s.billingSelectedId != null
    // 047 FR-002: pay is blocked until delivery is confirmed for the address.
    val payEnabled = !s.paying && s.selectedId != null && billingReady && s.serviced
    EffyPinnedBar {
        // The total the shopper is about to commit to: the cart's, plus the delivery fee once chosen.
        // ⚠ What is CHARGED is decided at the intent (and shown, exactly, on Payment); this line adds
        // two figures the platform already gave, and says "+ delivery" until there is a fee to add.
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Order total", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            val fee = s.deliveryFee
            EffyNumberRoll(
                if (fee != null) money(addAmounts(itemsTotal, fee.totalAmount), currency) else money(itemsTotal, currency) + " + delivery",
                style = MaterialTheme.typography.titleLarge.copy(fontFeatureSettings = "tnum"),
            )
        }
        EffyPrimaryButton(
            if (s.paying) "Processing…" else "Pay now",
            onClick = vm::payNow,
            enabled = payEnabled,
            loading = s.paying,
        )
    }
    }

    // The shared add-address form (022) — raised for shipping OR billing (023 US3).
    // ⚠ 034 — on the SHARED EffySheet now, which owns the title and the Save/Cancel pair. This was
    // the last hand-rolled ModalBottomSheet in the app; leaving it would have meant checkout's form
    // looking like a different component from the identical one in the address book.
    s.sheet?.let { sheet ->
        EffySheet(
            title = "Add an address",
            onDismiss = vm::dismissSheet,
            primaryLabel = "Add",
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

/**
 * Delivery (047; 069): serviceability, the standard/same-day choice, a time slot for same-day and a day
 * for standard. ⚠ No distance, ring, or shop is ever shown (FR-018/033).
 *
 * ⚠ NO SLOT IS SELECTED FOR THE SHOPPER (069 FR-006): a window is a promise about when someone will be
 * home. The standard day IS preselected — the earliest (FR-015).
 *
 * ⚠ EVERY OPTION SHOWS ITS FEE, AND THEY ARE ALL THE SAME FEE. A slot and a day have no price of their
 * own (FR-021); it is repeated so a shopper comparing slots can see the later one costs no more.
 *
 * A list and chips inside the section — no cards (Principle V).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DeliverySection(s: CheckoutUiState.Ready, vm: CheckoutViewModel) {
    if (s.selectedId == null) return
    val quote = s.quote
    // 079 — the section is headed by WHO DELIVERS, once the quote says: "Courier delivery", or
    // "Delivered by Effy" under the new delivery model. Plain "Delivery" while it is loading, when
    // nobody delivers, and under the checkout that predates delivery types.
    val heading = when (quote?.takeUnless { s.quoting }?.deliveryType) {
        DeliveryType.COURIER -> DeliveryTypeWords.COURIER
        DeliveryType.EFFY -> DeliveryTypeWords.EFFY
        null -> "Delivery"
    }
    CheckoutSection(heading, headingColor = if (quote?.deliveryType == DeliveryType.EFFY && !s.quoting) EffyRoles.brand else null) {
    when {
        s.quoting || quote == null -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.primary)
            Text("Checking delivery…", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        // 076 — the ONE refusal sentence (CoverageWords), the same the address book shows. No red.
        !quote.serviced -> EffyInlineError(CoverageWords.REFUSAL)
        // 079 — a courier delivers: NOTHING TO CHOOSE. Before the pickers — a courier quote carries no
        // windows, slots or days, and the branches below would draw an empty section for it.
        quote.courier != null -> {
            CourierSection(quote.courier)
            DeliveryFeeSummary(quote.courier.fee, quote.freeDeliveryRemainingAmount)
        }
        // Effy delivers: the shopper picks ONE window for the order (078).
        quote.effyWindows != null -> {
            EffyWindowsSection(
                view = effyWindowsView(quote.effyWindows, nowEpochMillis()),
                chosen = s.window,
                asapChosen = s.asap,
                enabled = !s.paying,
                onChoose = vm::setWindow,
                onClear = vm::clearWindow,
                onAsap = vm::setAsap,
            )
            // What is charged for delivery, line by line, before Pay (077 FR-028), and how close the
            // basket is to free delivery (FR-029). Nothing to show until a window is chosen.
            s.deliveryFee?.let { fee -> DeliveryFeeSummary(fee, quote.freeDeliveryRemainingAmount) }
        }
        // A serviced quote with neither block is a server fault: nothing is drawn, and nothing can be paid for.
        else -> Unit
    }
    }
}

/** One checkout section — a heading above its content (Checkout board). */
@Composable
private fun CheckoutSection(
    title: String,
    headingColor: androidx.compose.ui.graphics.Color? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
        Text(title, style = MaterialTheme.typography.titleLarge, color = headingColor ?: MaterialTheme.colorScheme.onSurface)
        content()
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
 * When the order arrives, when Effy delivers it (078, 085): ONE choice for the whole order.
 *
 *   Same-day delivery   today's open windows, each with the time to order by;
 *   Standard delivery   the next delivery days — a DAY IS A COMPLETE CHOICE (085) — then
 *                       "Standard" (as soon as possible), and under the chosen day an optional
 *                       "Need a specific time?" that shows that day's windows.
 *
 * ⚠ EVERY WORD IS `effyWindowsView`'S AND [DeliveryWindowWords]' — twins of what the website renders,
 * pinned to the same fixture. This composable only lays the words out.
 * ⚠ NOTHING IS SELECTED FOR THE SHOPPER.
 * ⚠ WHAT IS SELECTED IS DERIVED FROM THE CHOICE. The only local state is the day tapped when it
 * cannot be bought without a time (nothing is then chosen, and its windows open by themselves), and
 * whether the optional time list is open.
 * ⚠ Rows — no cards. Every target is at least 48dp.
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
    // "Need a specific time?" opened under a day that CAN be bought without one.
    var timeOpen by remember { mutableStateOf(false) }

    val chosenLater = chosen?.let { c -> view.later.firstOrNull { it.date == c.date } }
    val nothingChosen = chosen == null && !asapChosen
    val activeDay = chosenLater ?: if (nothingChosen) view.later.firstOrNull { it.date == pendingDay } else null
    val timedOnActive = activeDay != null && chosen != null && activeDay.anyTime?.slotId != chosen.slotId
    val timesShown = activeDay != null && (timedOnActive || timeOpen || activeDay.anyTime == null)

    Column(modifier = Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
        view.today?.let { today ->
            Text(view.sameDayTitle, style = MaterialTheme.typography.titleSmall)
            EffyDayWindows(today, chosen, enabled) { slotId, date ->
                pendingDay = null
                timeOpen = false
                onChoose(slotId, date)
            }
        }

        if (view.later.isNotEmpty() || view.asap != null) {
            Text(view.standardTitle, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = EffySpacing.md))
        }
        view.later.forEach { day ->
            val selected = activeDay?.date == day.date
            val unavailable = day.anyTime == null && day.windows.isEmpty()
            ChoiceRow(
                selected = selected,
                enabled = enabled && !unavailable,
                title = day.label,
                // A day with neither untimed room nor a window says why.
                detail = if (unavailable) day.sentence else null,
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
            )
            // The day's details OPEN under it (animated — Motion board), rather than appearing.
            AnimatedVisibility(selected) {
                Column(modifier = Modifier.padding(start = EffySpacing.md, top = EffySpacing.xs), verticalArrangement = Arrangement.spacedBy(EffySpacing.xs)) {
                    val anyTime = day.anyTime
                    if (anyTime == null) {
                        Text(DeliveryWindowWords.TIME_REQUIRED, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        if (!timedOnActive) {
                            Text(DeliveryWindowWords.ANY_TIME_DAY, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (day.windows.isNotEmpty()) {
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

        view.asap?.let { asap ->
            ChoiceRow(
                selected = asapChosen,
                enabled = enabled,
                title = asap.title,
                // ⚠ Always said as an estimate, in the words the order screen and the receipt use.
                detail = "${asap.hint} ${asapSentence(asap.estimate)}",
                onClick = {
                    pendingDay = null
                    timeOpen = false
                    onAsap()
                },
            )
        }
    }
}

/** One choice as a selectable tile: a day, or "Standard" (Checkout board — 56dp, blue when chosen). */
@Composable
private fun ChoiceRow(selected: Boolean, enabled: Boolean, title: String, detail: String?, onClick: () -> Unit) {
    ChoiceTile(selected = selected, enabled = enabled, onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Text(title, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium))
        detail?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

/**
 * A delivery choice: white with a hairline, or — chosen — the light-blue tint with a 2dp blue edge.
 * The WHOLE tile is the target, announced as one radio button.
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
        Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s), modifier = Modifier.fillMaxWidth()) {
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
                        // 077 FR-030 — what this window adds, BEFORE it is chosen. Nothing when it adds nothing.
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
 * 079 — the delivery section when a COURIER delivers the order: who, and roughly when.
 *
 * ⚠ THERE IS NOTHING TO CHOOSE, AND SO NOTHING TO TAP. No window, no day, no method — a disabled
 * picker would only suggest one was meant to be there.
 * ⚠ EVERY WORD IS [DeliveryTypeWords]' — the twin of what the website prints. The estimate is always
 * said AS an estimate.
 * ⚠ When the address IS one Effy delivers to and no window is left, the shopper is told that FIRST:
 * they were expecting a time to pick.
 * ⚠ Text in a column — no card (Principle V).
 */
@Composable
private fun CourierSection(courier: CourierDelivery) {
    val (partner, estimate) = DeliveryTypeWords.courierLines(courier.estimate)
    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.xs)) {
        if (courier.noWindowLeft) {
            EffyNotice("${DeliveryTypeWords.NO_WINDOWS_LEFT} ${DeliveryTypeWords.COURIER_INSTEAD_OF_WINDOWS}", icon = Res.drawable.lucide_info)
        }
        EffyCard {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
                Icon(painterResource(Res.drawable.lucide_truck), contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp))
                Column {
                    Text(partner, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium))
                    Text(estimate, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

/** 077 — the delivery lines, in the shared words, and the free-delivery hint. A list, not a card. */
@Composable
private fun DeliveryFeeSummary(fee: DeliveryFee, freeRemaining: String?) {
    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.xs)) {
        fee.lines.forEach { line ->
            val saving = line.amount.startsWith("-")
            EffyDetailRow(
                DeliveryFeeWords.label(line.kind),
                if (saving) "−$${line.amount.removePrefix("-")}" else "$${line.amount}",
                // A saving (free delivery) in Effy green — the storefront's savings colour.
                valueColor = if (saving) EffyRoles.brand else androidx.compose.ui.graphics.Color.Unspecified,
            )
        }
        when {
            fee.free -> EffyNotice(DeliveryFeeWords.FREE_REACHED, icon = Res.drawable.lucide_circle_check, positive = true)
            freeRemaining != null -> Text(
                DeliveryFeeWords.spendMore("$$freeRemaining"),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** Billing address (023 US4): "same as shipping" toggle ON by default; OFF reveals the same picker. */
@Composable
private fun BillingSection(s: CheckoutUiState.Ready, vm: CheckoutViewModel) {
    EffyGroup(caption = "Billing") {
        EffySwitchRow(
            label = "Billing address same as shipping",
            checked = s.billingSameAsShipping,
            onCheckedChange = vm::setBillingSameAsShipping,
        )
    }
    if (!s.billingSameAsShipping) {
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

private fun SavedAddress.formatSummary(): String = buildString {
    append(line1)
    line2?.takeIf { it.isNotBlank() }?.let { append(", ").append(it) }
    append(", ").append(city).append(" ").append(postalCode)
    append(", ").append(country)
}

/** "1,250" — grouped thousands. */
private fun formatPointsCount(n: Long): String = n.toString().reversed().chunked(3).joinToString(",").reversed()
