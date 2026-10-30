package com.effyshopping.driver.mobile.features.today.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.effyshopping.driver.mobile.core.presentation.DriverButton
import com.effyshopping.driver.mobile.core.presentation.DriverButtonStyle
import com.effyshopping.driver.mobile.core.presentation.DriverTextField
import com.effyshopping.driver.mobile.features.driver.domain.CheckAnswer
import com.effyshopping.driver.mobile.features.driver.domain.CheckItem
import com.effyshopping.driver.mobile.features.driver.domain.VehicleCheckAnswer

/**
 * The pre-trip check, on Today before any work: six items, each OK, a minor issue or unsafe, with a
 * note where it isn't OK. Every item must be answered. An unsafe answer means no work until dispatch
 * clears it - the driver is told that before they send.
 */
@Composable
fun VehicleCheckForm(vehicleLabel: String?, working: Boolean, onSubmit: (List<VehicleCheckAnswer>) -> Unit) {
    val answers = remember { mutableStateMapOf<CheckItem, CheckAnswer>() }
    val notes = remember { mutableStateMapOf<CheckItem, String>() }
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Check your vehicle", fontSize = 26.sp, lineHeight = 32.sp, fontWeight = FontWeight.SemiBold)
            Text(
                listOfNotNull(vehicleLabel, "Once a day, before you take work.").joinToString(" · "),
                style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        CheckItem.entries.forEach { item ->
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(item.label, style = MaterialTheme.typography.titleMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    CheckAnswer.entries.forEach { a ->
                        DriverButton(
                            a.label, onClick = { answers[item] = a },
                            style = when {
                                answers[item] != a -> DriverButtonStyle.Outline
                                a == CheckAnswer.UNSAFE -> DriverButtonStyle.Problem
                                else -> DriverButtonStyle.Primary
                            },
                            tall = false, modifier = Modifier.weight(1f),
                        )
                    }
                }
                if (answers[item] != null && answers[item] != CheckAnswer.OK) {
                    DriverTextField(notes[item].orEmpty(), { notes[item] = it }, label = "What's wrong?", placeholder = "So it can be fixed")
                }
            }
        }
        val unsafe = answers.values.any { it == CheckAnswer.UNSAFE }
        if (unsafe) {
            Text(
                "With anything unsafe you won't be given work until dispatch clears it. Dispatch is told as soon as you send this.",
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        DriverButton(
            "Send the check",
            onClick = { onSubmit(CheckItem.entries.map { VehicleCheckAnswer(it, answers.getValue(it), notes[it]) }) },
            enabled = answers.size == CheckItem.entries.size && !working,
            loading = working,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
