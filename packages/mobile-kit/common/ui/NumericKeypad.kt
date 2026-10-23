// An in-app numeric keypad for the delivery code: four digits a customer reads aloud, entered one-handed
// at a doorstep, where nothing autofills and a system keyboard would cover half the screen. The
// sign-in code keeps `OtpInput` (emailed, so autofill and paste matter).
package com.effyshopping.mobile.kit.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp

/** 56dp, well past the touch minimum: a doorstep, one hand, gloves. */
private val KeyHeight = 56.dp

private const val BACKSPACE = "⌫"

/**
 * A 3×4 numeric keypad laid out like a phone dialpad (1–9, blank, 0, backspace).
 *
 * @param onDigit a digit 0–9 was pressed
 * @param onBackspace the delete key was pressed
 * @param enabled when false every key is inert (e.g. while submitting)
 */
@Composable
fun NumericKeypad(
    onDigit: (Char) -> Unit,
    onBackspace: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val rows = listOf(
        listOf("1", "2", "3"),
        listOf("4", "5", "6"),
        listOf("7", "8", "9"),
        listOf("", "0", BACKSPACE),
    )

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        rows.forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { key ->
                    if (key.isEmpty()) {
                        // The dialpad's empty slot: holds the shape, carries no semantics.
                        Box(Modifier.weight(1f).height(KeyHeight))
                    } else {
                        KeypadKey(
                            key = key,
                            enabled = enabled,
                            onPress = {
                                if (key == BACKSPACE) onBackspace() else onDigit(key[0])
                            },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun KeypadKey(
    key: String,
    enabled: Boolean,
    onPress: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // The glyph is decorative; "Delete" is the spoken label (screen readers read the backspace character as nothing).
    val spoken = if (key == BACKSPACE) "Delete" else key

    Box(
        modifier = modifier
            .heightIn(min = KeyHeight)
            .height(KeyHeight)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable(enabled = enabled, onClick = onPress)
            .clearAndSetSemantics { contentDescription = spoken },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = key,
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}
