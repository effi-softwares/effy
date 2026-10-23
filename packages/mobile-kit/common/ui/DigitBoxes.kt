// Display-only digit positions for digits entered with [NumericKeypad] (the delivery code: nothing to
// autofill, no keyboard), unlike `OtpCells`, which decorates a real text field. One accessibility node:
// the keypad keys are the interactive elements, this is the readout.
package com.effyshopping.mobile.kit.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp

/**
 * [length] boxes showing [value]'s digits, with the next position marked.
 *
 * @param value the digits entered so far; anything past [length] is ignored
 * @param length how many positions to draw (4 for a delivery code)
 * @param isError draws every box in the error colour (the code was refused)
 * @param reducedMotion suppresses the pulsing next-position marker
 */
@Composable
fun DigitBoxes(
    value: String,
    length: Int,
    modifier: Modifier = Modifier,
    isError: Boolean = false,
    reducedMotion: Boolean = false,
) {
    val digits = value.take(length)
    val spoken = if (digits.isEmpty()) {
        "Code, empty, $length digits required"
    } else {
        // Spaced so a screen reader reads "1 4 9" rather than "one hundred and forty-nine".
        "Code ${digits.toCharArray().joinToString(" ")}, ${length - digits.length} remaining"
    }

    val pulse by if (reducedMotion) {
        androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(1f) }
    } else {
        rememberInfiniteTransition(label = "caret").animateFloat(
            initialValue = 0.35f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(1100), RepeatMode.Reverse),
            label = "caret-alpha",
        )
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clearAndSetSemantics { contentDescription = spoken },
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        repeat(length) { index ->
            val filled = index < digits.length
            val isNext = index == digits.length
            val border = when {
                isError -> MaterialTheme.colorScheme.error
                filled || isNext -> MaterialTheme.colorScheme.onSurface
                else -> MaterialTheme.colorScheme.outlineVariant
            }
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(64.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surface)
                    .border(1.5.dp, border, RoundedCornerShape(12.dp))
                    .alpha(if (isNext && !filled) pulse else 1f),
                contentAlignment = Alignment.Center,
            ) {
                if (filled) {
                    Text(
                        text = digits[index].toString(),
                        style = MaterialTheme.typography.headlineSmall,
                        color = if (isError) {
                            MaterialTheme.colorScheme.error
                        } else {
                            MaterialTheme.colorScheme.onSurface
                        },
                    )
                }
            }
        }
    }
}
