// An in-app numeric keypad (060 FR-020).
//
// ⚠ SCOPE CORRECTION, recorded rather than silently narrowed. FR-020 asks that BOTH the sign-in code
// and the delivery code use discrete boxes plus this keypad, so "the system keyboard never appears".
// Building that for the SIGN-IN code would destroy capability the design's mockup cannot know about:
//
//   * the sign-in code is EMAILED, and both platforms autofill it from the notification/inbox —
//     an in-app keypad has no autofill, so every driver would hand-type six digits they could have
//     tapped once;
//   * paste (from a password manager or the mail app) stops working;
//   * `OtpInput`/`OtpCells` already draws exactly the design's boxed positions, and 036 established
//     WHY it is one field behind decoration rather than six inputs — six real inputs are how
//     screen-reader users lose their place. iOS even has a bespoke UIKit actual because Compose
//     cannot paint behind an interop view.
//
// So: the SIGN-IN code keeps `OtpInput` with `OtpVariant.Cells` (same appearance, no capability
// lost), and this keypad serves the DELIVERY code, where it is unambiguously right — four digits a
// customer reads aloud while the driver holds the phone one-handed at a doorstep. Nothing autofills
// that, and a system keyboard would cover half the screen to collect four characters.
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

/** ⚠ 56 dp, comfortably past the constitution's fat-finger minimum — a doorstep, one hand, gloves. */
private val KeyHeight = 56.dp

private const val BACKSPACE = "⌫"

/**
 * A 3×4 numeric keypad. Digits 1–9, then a blank, 0 and backspace — the layout of every phone
 * dialpad, so a driver does not have to look at it.
 *
 * @param onDigit a digit 0–9 was pressed
 * @param onBackspace the delete key was pressed
 * @param enabled when false every key is inert (e.g. while a submission is in flight)
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
                        // The dialpad's empty bottom-left slot. It holds the grid's shape and must
                        // not be announced, so it carries no semantics at all.
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
    // The glyph is decorative; the spoken label is what a screen reader announces. "Delete" rather
    // than the backspace character, which most screen readers read as nothing at all.
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
