package com.effyshopping.driver.mobile.features.collection.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.effyshopping.mobile.kit.ui.ChoiceChips

/** What can be wrong with a package at a shop. A closed set, so back-office can act on it. */
enum class ProblemKind(val wire: String, val label: String) {
    MISSING("missing", "Not there at all"),
    SHORT("short", "Fewer than expected"),
    DAMAGED("damaged", "Damaged"),
    WRONG("wrong", "Wrong package"),
}

/**
 * Report a missing or short package (060 US1, FR-021, design screen `shop-problem`).
 *
 * ⚠ **This replaces a single `TextButton`.** Before 060 the shop-stop screen carried
 * `TextButton(onClick = { onReport("missing") })` — one tap, fired immediately, no confirmation.
 * A driver could not say *which* package, could not say what was actually wrong (it was always
 * "missing"), and could not add a note. Whoever read the report in back-office got a stop id and
 * the word "missing".
 *
 * ⚠ **Reporting must not block the rest of the stop or the run** (FR-021). Submitting returns the
 * driver to the manifest with the report recorded; nothing is gated on it. That is stated on the
 * screen too, because a driver who thinks a report halts their round will avoid filing one — and
 * then nobody at Effy learns anything.
 *
 * ⚠ **The package reference travels in the NOTE.** `reportIssue` has no package parameter (049
 * built it stop-level) and adding one is backend work this slice excludes. `reportPackage` composes
 * it; see that function for why this is recorded rather than quietly encoded.
 */
@Composable
fun ShopProblemScreen(
    state: CollectionUiState,
    onBack: () -> Unit,
    onSubmit: (packageRef: String?, kind: String, note: String?) -> Unit,
) {
    val stop = state.stop
    var selectedRef by rememberSaveable { mutableStateOf<String?>(null) }
    var kind by rememberSaveable { mutableStateOf<ProblemKind?>(null) }
    var note by rememberSaveable { mutableStateOf("") }

    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).imePadding()) {
        ScreenHeader(
            title = "Report a problem",
            subtitle = stop?.shopName,
            onBack = onBack,
        )

        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            SectionLabel("WHICH PACKAGE?")
            val refs = stop?.packages?.map { it.ref }.orEmpty()
            if (refs.isEmpty()) {
                Text(
                    "No packages loaded for this stop.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                ChoiceChips(
                    options = refs,
                    selected = selectedRef,
                    onSelect = { selectedRef = it },
                    label = { it },
                )
            }

            Spacer(Modifier.height(10.dp))
            SectionLabel("WHAT'S WRONG?")
            ChoiceChips(
                options = ProblemKind.entries.toList(),
                selected = kind,
                onSelect = { kind = it },
                label = { it.label },
            )

            Spacer(Modifier.height(10.dp))
            SectionLabel("ANYTHING ELSE? (OPTIONAL)")
            OutlinedTextField(
                value = note,
                onValueChange = { note = it },
                placeholder = { Text("Note for the shop and dispatch…") },
                minLines = 3,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(4.dp))
            Text(
                "Reporting doesn't block the rest of this stop or your run.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(16.dp))
        }

        state.message?.let {
            Text(
                it,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            )
        }

        Column(Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
            Button(
                // ⚠ A kind is required; a package reference is not. A driver may know something is
                // wrong before they know which parcel it was, and refusing the report in that case
                // loses the only signal Effy would ever get.
                onClick = { kind?.let { onSubmit(selectedRef, it.wire, note.ifBlank { null }) } },
                enabled = kind != null && !state.isWorking,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth().height(56.dp),
            ) {
                Text(
                    "Report and collect the rest",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}
