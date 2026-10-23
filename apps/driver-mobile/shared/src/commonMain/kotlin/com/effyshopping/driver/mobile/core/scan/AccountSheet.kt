package com.effyshopping.driver.mobile.core.scan

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.presentation.DriverButton
import com.effyshopping.driver.mobile.core.presentation.DriverButtonStyle
import com.effyshopping.driver.mobile.core.presentation.DriverChoice
import com.effyshopping.driver.mobile.core.presentation.DriverSheet
import com.effyshopping.driver.mobile.core.presentation.DriverTextField

/** One package not scanned, as the account sheet lists it. */
data class Unscanned(val code: String, val title: String, val sub: String? = null)

/** What the driver said about one unscanned package: it is here (ticked by hand), or it is missing. */
sealed interface Accounted {
    data object Here : Accounted
    /** [reason] is the step's own reason key (null where the step has none, as at check-in); [note] for "Other". */
    data class Missing(val reason: String?, val note: String?) : Accounted
}

/**
 * Accounting for every package not scanned: the driver says of each that it is here or missing (with a
 * reason where the step asks), and the confirm waits until every one is answered; nothing moves by
 * silence. [reasons] are (key, words) pairs; empty means "missing" needs no reason.
 */
@Composable
fun AccountSheet(
    title: String,
    description: String,
    unscanned: List<Unscanned>,
    hereLabel: String,
    missingLabel: String,
    reasons: List<Pair<String, String>>,
    otherKey: String?,
    confirmLabel: String,
    working: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (Map<String, Accounted>) -> Unit,
) {
    val answers = remember(unscanned) { mutableStateMapOf<String, Accounted>() }
    val complete = unscanned.all { u ->
        when (val a = answers[u.code]) {
            null -> false
            Accounted.Here -> true
            is Accounted.Missing -> (reasons.isEmpty() || a.reason != null) && (a.reason != otherKey || !a.note.isNullOrBlank())
        }
    }
    DriverSheet(title = title, onDismiss = onDismiss, description = description) {
        unscanned.forEach { u ->
            val a = answers[u.code]
            Column(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(u.title, style = MaterialTheme.typography.titleMedium)
                u.sub?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DriverButton(
                        hereLabel, onClick = { answers[u.code] = Accounted.Here },
                        style = if (a == Accounted.Here) DriverButtonStyle.Primary else DriverButtonStyle.Outline,
                        tall = false, modifier = Modifier.weight(1f),
                    )
                    DriverButton(
                        missingLabel, onClick = { answers[u.code] = (a as? Accounted.Missing) ?: Accounted.Missing(null, null) },
                        style = if (a is Accounted.Missing) DriverButtonStyle.Problem else DriverButtonStyle.Outline,
                        tall = false, modifier = Modifier.weight(1f),
                    )
                }
                if (a is Accounted.Missing && reasons.isNotEmpty()) {
                    reasons.forEach { (key, words) ->
                        DriverChoice(words, selected = a.reason == key, onSelect = { answers[u.code] = a.copy(reason = key) })
                    }
                    if (otherKey != null && a.reason == otherKey) {
                        DriverTextField(
                            value = a.note.orEmpty(), onValueChange = { answers[u.code] = a.copy(note = it) },
                            label = "What happened?", placeholder = "So dispatch can follow it up",
                        )
                    }
                }
            }
        }
        DriverButton(confirmLabel, onClick = { onConfirm(answers.toMap()) }, enabled = complete && !working, loading = working, modifier = Modifier.fillMaxWidth())
    }
}
