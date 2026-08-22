package com.effyshopping.driver.mobile.features.delivery.presentation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.features.delivery.domain.DropStatus
import com.effyshopping.driver.mobile.features.delivery.domain.FailureReason

/** Same-day delivery run — ordered customer drops (FR-018). */
@Composable
fun DeliveryRunScreen(state: DeliveryUiState, onBack: () -> Unit, onOpenDrop: (String) -> Unit) {
    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(20.dp)) {
        Header("Same-day run", onBack)
        val run = state.run
        when {
            state.isLoading && run == null -> Centered { CircularProgressIndicator() }
            run == null -> Centered { Text(state.message ?: "Couldn't load the run.") }
            run.drops.isEmpty() -> Centered { Text("No drops in this run.") }
            else -> Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                run.drops.forEach { drop ->
                    Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth().clickable { onOpenDrop(drop.dropId) }) {
                        Row(Modifier.padding(16.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Column {
                                Text(drop.orderRef, style = MaterialTheme.typography.titleMedium)
                                Text("${drop.customerSuburb} · ${drop.packageCount} package(s)",
                                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text(if (drop.status == DropStatus.DELIVERED) "✓" else if (drop.status == DropStatus.FAILED) "✕" else "›",
                                style = MaterialTheme.typography.titleLarge)
                        }
                    }
                }
            }
        }
    }
}

/** Drop detail — lifecycle advance, then proof or fail (FR-019/020/024–028). */
@Composable
fun DropDetailScreen(
    state: DeliveryUiState,
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
    onAdvance: (String) -> Unit,
    onDeliverCode: (String, String?) -> Unit,
    onDeliverContactless: (String?) -> Unit,
    onFail: (FailureReason, String?) -> Unit,
    onNext: () -> Unit,
) {
    val drop = state.drop
    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(20.dp)) {
        Header(drop?.orderRef ?: "Drop", onBack)
        when {
            state.delivered -> { DeliveredSuccess(onNext); return@Column }
            state.failed -> { FailedState(onNext); return@Column }
            state.isLoading && drop == null -> { Centered { CircularProgressIndicator() }; return@Column }
            drop == null -> { Centered { Text(state.message ?: "Couldn't load the drop.") }; return@Column }
        }
        drop!!

        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text(drop.customerName, style = MaterialTheme.typography.titleMedium)
                    Text(drop.addressFull, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    drop.instructions?.takeIf { it.isNotBlank() }?.let {
                        Spacer(Modifier.height(6.dp))
                        Text("Note: $it", style = MaterialTheme.typography.bodyMedium)
                    }
                    Spacer(Modifier.height(8.dp))
                    Text("${drop.packages.size} package(s)", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = { onNavigate(drop.addressFull) }, shape = RoundedCornerShape(12.dp), modifier = Modifier.weight(1f).height(50.dp)) {
                    Text("Navigate")
                }
                // Masked contact — the relay is not built yet (R6), so this is disabled with a clear reason.
                OutlinedButton(onClick = {}, enabled = false, shape = RoundedCornerShape(12.dp), modifier = Modifier.weight(1f).height(50.dp)) {
                    Text("Contact")
                }
            }
            Text("Masked contact is coming soon.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

            state.message?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }

            when (drop.status) {
                DropStatus.STAGED, DropStatus.OUT_FOR_DELIVERY, DropStatus.EN_ROUTE ->
                    AdvanceControls(drop.status, state.isWorking, onAdvance)
                DropStatus.ARRIVED -> ProofControls(state.isWorking, onDeliverCode, onDeliverContactless, onFail)
                else -> {}
            }
        }
    }
}

@Composable
private fun AdvanceControls(status: DropStatus, working: Boolean, onAdvance: (String) -> Unit) {
    val (label, to) = when (status) {
        DropStatus.STAGED -> "Start delivery" to "out_for_delivery"
        DropStatus.OUT_FOR_DELIVERY -> "En route" to "en_route"
        else -> "I've arrived" to "arrived"
    }
    Button(onClick = { onAdvance(to) }, enabled = !working, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(56.dp)) {
        Text(label, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun ProofControls(
    working: Boolean,
    onDeliverCode: (String, String?) -> Unit,
    onDeliverContactless: (String?) -> Unit,
    onFail: (FailureReason, String?) -> Unit,
) {
    var mode by remember { mutableStateOf("pick") }
    var code by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }

    when (mode) {
        "pick" -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Complete with proof", style = MaterialTheme.typography.titleMedium)
            Button(onClick = { mode = "code" }, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(52.dp)) { Text("Delivery code") }
            Button(onClick = { mode = "contactless" }, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(52.dp)) { Text("Contactless (leave at door)") }
            OutlinedButton(onClick = {}, enabled = false, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(52.dp)) { Text("Photo / signature — coming soon") }
            TextButton(onClick = { mode = "fail" }) { Text("Can't deliver") }
        }
        "code" -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedTextField(value = code, onValueChange = { code = it.filter { c -> c.isDigit() }.take(4) },
                label = { Text("Delivery code") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth())
            Button(onClick = { onDeliverCode(code, null) }, enabled = code.length >= 3 && !working,
                shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(56.dp)) { Text("Confirm delivery") }
            TextButton(onClick = { mode = "pick" }) { Text("Back") }
        }
        "contactless" -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedTextField(value = note, onValueChange = { note = it }, label = { Text("Where did you leave it? (optional)") }, modifier = Modifier.fillMaxWidth())
            Button(onClick = { onDeliverContactless(note.ifBlank { null }) }, enabled = !working,
                shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(56.dp)) { Text("Confirm — left at door") }
            TextButton(onClick = { mode = "pick" }) { Text("Back") }
        }
        "fail" -> FailPicker(working, onFail) { mode = "pick" }
    }
}

@Composable
private fun FailPicker(working: Boolean, onFail: (FailureReason, String?) -> Unit, onBack: () -> Unit) {
    val reasons = listOf(
        FailureReason.NOBODY_HOME to "Nobody home",
        FailureReason.WRONG_ADDRESS to "Wrong / incomplete address",
        FailureReason.CUSTOMER_REFUSED to "Customer refused",
        FailureReason.ACCESS_BLOCKED to "Access blocked",
        FailureReason.OTHER to "Other",
    )
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Why can't it be delivered?", style = MaterialTheme.typography.titleMedium)
        reasons.forEach { (reason, label) ->
            OutlinedButton(onClick = { onFail(reason, null) }, enabled = !working, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(50.dp)) {
                Text(label)
            }
        }
        TextButton(onClick = onBack) { Text("Back") }
    }
}

@Composable
private fun DeliveredSuccess(onNext: () -> Unit) {
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text("✓", style = MaterialTheme.typography.displayLarge, color = MaterialTheme.colorScheme.primary)
        Text("Delivered", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(24.dp))
        Button(onClick = onNext, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth(0.7f).height(56.dp)) { Text("Next") }
    }
}

@Composable
private fun FailedState(onNext: () -> Unit) {
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Marked undeliverable", style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
        Text("Back-office will follow up.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(24.dp))
        Button(onClick = onNext, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth(0.7f).height(56.dp)) { Text("Next") }
    }
}

@Composable
private fun Header(title: String, onBack: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = onBack) { Text("‹ Back") }
        Spacer(Modifier.width(4.dp))
        Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) { content() }
}
