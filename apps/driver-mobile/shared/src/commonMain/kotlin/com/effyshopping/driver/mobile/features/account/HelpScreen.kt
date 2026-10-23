package com.effyshopping.driver.mobile.features.account

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.presentation.DriverGroup
import com.effyshopping.driver.mobile.core.presentation.DriverIcon
import com.effyshopping.driver.mobile.core.presentation.DriverInlineBar
import com.effyshopping.driver.mobile.core.presentation.DriverRow
import com.effyshopping.driver.mobile.core.presentation.DriverSectionLabel
import com.effyshopping.driver.mobile.core.presentation.DriverSize
import com.effyshopping.driver.mobile.features.driver.domain.Driver
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_chevron_down
import com.effyshopping.driver.mobile.resources.lucide_chevron_up
import com.effyshopping.driver.mobile.resources.lucide_file_text
import com.effyshopping.driver.mobile.resources.lucide_map_pin
import com.effyshopping.driver.mobile.resources.lucide_phone

/** The questions drivers ask, answered in the app's own words. */
internal val HELP_QUESTIONS: List<Pair<String, String>> = listOf(
    "Nobody's home — what do I do?" to
        "If the customer asked for \"leave at the door\", leave it safely and take a photo. Otherwise try " +
        "calling them, then choose Can't deliver → Nobody home and keep the parcels for the hub.",
    "A package is missing at the shop" to
        "On the stop, report the package as missing or short and collect the rest. Dispatch is told straight away.",
    "My run says it isn't open yet" to
        "Work is given to you before it can be done. Look through it now — the buttons unlock by themselves at the time shown.",
    "I'm offline — is my work saved?" to
        "Yes. What you do is saved on this phone and sends by itself when you're back online. Today says how many updates are waiting.",
    "How do I return parcels to the hub?" to
        "When only parcels you couldn't deliver are left, Today shows the return step. Scan them in at the hub, or return them all by hand.",
    "The customer wants to change the address" to
        "The address can't be changed in the app. Call dispatch — they can move the order.",
)

/**
 * Help (canvas `Help`). The contacts are operator-supplied at build time and never sample content: a
 * number a driver would dial is a real-world identifier. One that has not been supplied says so.
 */
@Composable
fun HelpScreen(
    driver: Driver,
    onBack: () -> Unit,
    dispatchPhone: String?,
    hubDeskPhone: String?,
    handbookUrl: String?,
    onDial: (String) -> Unit,
    onOpenLink: (String) -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        DriverInlineBar("Help", backLabel = "Account", onBack = onBack)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            Column {
                DriverSectionLabel("Talk to someone")
                DriverGroup {
                    DriverRow(
                        "Call dispatch",
                        meta = dispatchPhone?.let { "$it · anything about today's work" } ?: "Not set up yet — ask your manager",
                        onClick = dispatchPhone?.let { { onDial(it) } },
                        leading = { DriverIcon(Res.drawable.lucide_phone, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                    )
                    DriverRow(
                        "Call the hub desk",
                        meta = hubDeskPhone?.let { listOfNotNull(it, driver.hub?.takeIf { h -> h.isNotBlank() }).joinToString(" · ") }
                            ?: "Not set up yet — ask your manager",
                        onClick = hubDeskPhone?.let { { onDial(it) } },
                        leading = { DriverIcon(Res.drawable.lucide_map_pin, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                    )
                    DriverRow(
                        "Driver handbook",
                        meta = if (handbookUrl != null) "Opens in your browser" else "Not set up yet — ask your manager",
                        onClick = handbookUrl?.let { { onOpenLink(it) } },
                        leading = { DriverIcon(Res.drawable.lucide_file_text, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                        last = true,
                    )
                }
            }
            Column {
                DriverSectionLabel("Common questions")
                DriverGroup {
                    HELP_QUESTIONS.forEachIndexed { i, (q, a) ->
                        Question(q, a, startOpen = i == 0, last = i == HELP_QUESTIONS.lastIndex)
                    }
                }
            }
        }
    }
}

@Composable
private fun Question(question: String, answer: String, startOpen: Boolean, last: Boolean) {
    var open by rememberSaveable(question) { mutableStateOf(startOpen) }
    Column(Modifier.fillMaxWidth().animateContentSize()) {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable(role = Role.Button) { open = !open }
                .semantics { stateDescription = if (open) "Expanded" else "Collapsed" }
                .heightIn(min = 56.dp)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(question, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), modifier = Modifier.weight(1f))
            DriverIcon(if (open) Res.drawable.lucide_chevron_up else Res.drawable.lucide_chevron_down, size = 18.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (open) {
            Text(answer, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 14.dp))
        }
        if (!last) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
    }
}
