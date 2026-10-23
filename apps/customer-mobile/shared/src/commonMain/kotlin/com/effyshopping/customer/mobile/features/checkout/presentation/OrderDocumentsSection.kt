package com.effyshopping.customer.mobile.features.checkout.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.observability.AnalyticsEvent
import com.effyshopping.customer.mobile.core.platform.rememberShareFile
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.customer.mobile.core.presentation.EffyField
import com.effyshopping.customer.mobile.core.presentation.EffySheet
import com.effyshopping.customer.mobile.core.presentation.EffyTextLink
import com.effyshopping.customer.mobile.features.checkout.domain.words

/**
 * Documents: the delivery note, what was supplied line by line, once the order has arrived,
 * and its PDF to save or share. Digital only — there is no paper note in the bag.
 *
 * No prices, and nothing about how the order was filled (the server merges the lines).
 */
@Composable
internal fun OrderDocumentsSection(container: AppContainer, orderId: String) {
    // Keyed by order, like the payment screen: one ViewModel per order, never a previous order's note.
    val vm = viewModel(key = "documents:$orderId") { OrderDocumentsViewModel(orderId, container.orderDocuments) }
    val state by vm.state.collectAsState()
    val share = rememberShareFile()
    LaunchedEffect(orderId) { vm.load() }

    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Documents", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            val ready = state as? OrderDocumentsViewModel.State.Ready
            if (ready != null) {
                // 48dp tall — the minimum target.
                EffyTextLink(
                    if (ready.downloading) "Getting PDF…" else "Delivery note PDF",
                    enabled = !ready.downloading,
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                    onClick = { vm.download { bytes, name -> share(bytes, name, "application/pdf") } },
                )
            }
        }
        when (val s = state) {
            OrderDocumentsViewModel.State.Loading -> Text("Loading…", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OrderDocumentsViewModel.State.NotYet -> Text(
                "Your delivery note will be here once your order has arrived.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OrderDocumentsViewModel.State.Unavailable -> Text(
                "We couldn't load your delivery note just now.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            is OrderDocumentsViewModel.State.Ready -> {
                LaunchedEffect(s.note.orderNumber) { container.analyticsDriver.capture(AnalyticsEvent.DeliveryNoteViewed) }
                Text("Delivery note", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                s.note.lines.forEach { line ->
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                        Text(line.name, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                        Column(horizontalAlignment = Alignment.End) {
                            Text("${line.supplied} of ${line.ordered}", style = MaterialTheme.typography.bodyMedium)
                            line.status.words()?.let {
                                Text(it, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
                s.message?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
        }
        TaxInvoiceBlock(vm, onShare = { bytes, name ->
            container.analyticsDriver.capture(AnalyticsEvent.TaxInvoiceDownloaded(if (name.contains("-ADJ-")) "adjustment" else "invoice"))
            share(bytes, name, "application/pdf")
        })
    }
}

/**
 * The tax invoice, on request. "Get tax invoice" issues it, and an issued invoice never
 * changes, so the optional business details are offered before, never after.
 */
@Composable
private fun TaxInvoiceBlock(vm: OrderDocumentsViewModel, onShare: (ByteArray, String) -> Unit) {
    val tax by vm.tax.collectAsState()
    var sheet by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf<String?>(null) }

    Text("Tax invoice", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = EffySpacing.s))
    when (val t = tax) {
        is OrderDocumentsViewModel.Tax.Ready -> {
            t.documents.forEach { d ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("${d.kind.words()} · ${d.number}", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                    EffyTextLink(
                        if (t.sharing == d.number) "Getting PDF…" else "PDF",
                        enabled = t.sharing == null,
                        modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                        onClick = { vm.shareTaxDocument(d.number, onShare) },
                    )
                }
            }
            t.message?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        else -> {
            (t as? OrderDocumentsViewModel.Tax.Refused)?.let {
                Text(it.text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
                EffyTextLink(
                    if (t is OrderDocumentsViewModel.Tax.Loading) "Getting your invoice…" else "Get tax invoice",
                    enabled = t !is OrderDocumentsViewModel.Tax.Loading,
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                    onClick = vm::getTaxInvoice,
                )
                EffyTextLink(
                    "Add business details",
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                    onClick = { sheet = true },
                )
            }
            saved?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }

    if (sheet) BusinessIdentitySheet(vm, onDone = { message -> sheet = false; saved = message })
}

/** The customer's own business name and ABN, for this order's invoice. A sheet, never a dialog. */
@Composable
private fun BusinessIdentitySheet(vm: OrderDocumentsViewModel, onDone: (String) -> Unit) {
    var name by remember { mutableStateOf("") }
    var abn by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    EffySheet(
        title = "Business details",
        onDismiss = { onDone("") },
        dirty = name.isNotBlank() || abn.isNotBlank(),
        primaryLabel = "Save",
        primaryLoading = saving,
        primaryEnabled = name.isNotBlank() || abn.isNotBlank(),
        onPrimary = {
            saving = true
            scope.launch {
                val refusal = vm.saveBusinessIdentity(name, abn)
                saving = false
                if (refusal == null) onDone("Saved. Your business details will be on the invoice.") else error = refusal
            }
        },
    ) {
        Text(
            "Add these before you get the invoice — an issued invoice can't be changed.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        EffyField(label = "Business name", value = name, onValueChange = { name = it })
        EffyField(
            label = "ABN",
            value = abn,
            onValueChange = { abn = it; error = null },
            error = error,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        )
    }
}
