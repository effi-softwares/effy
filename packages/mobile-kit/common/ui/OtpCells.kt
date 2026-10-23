package com.effyshopping.mobile.kit.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/** How the one-time-code field presents itself. */
enum class OtpVariant {
    /** One box, flowing text (the default). */
    Plain,

    /** Six visible character positions, drawn behind one field. */
    Cells,
}

/**
 * Six character cells drawn from the current value, Android only (iOS draws them in UIKit, since
 * Compose cannot paint behind an interop view). Decoration around one `BasicTextField` with one
 * accessibility node, not six fields. It does not render `innerTextField`, which would paint the text
 * over the cells, so there is no caret or selection handle: a pulsing underline marks the next cell,
 * and paste still works. An over-length value falls back to flowing text in the error colour, so an
 * eight-digit paste never looks like a valid six-digit code.
 */
@Composable
fun OtpCells(
    value: String,
    isError: Boolean,
    enabled: Boolean = true,
    modifier: Modifier = Modifier,
) {
    val tooLong = value.length > OTP_LENGTH

    if (tooLong) {
        // No cells: the person must see that what they pasted is not our code.
        Box(
            modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .background(
                    MaterialTheme.colorScheme.surfaceContainerLow,
                    RoundedCornerShape(16.dp),
                )
                .padding(horizontal = 18.dp, vertical = 14.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            Text(
                value,
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.error,
            )
        }
        return
    }

    // Full width, capped at 360dp (six ~48dp cells and five 8dp gaps), so cells stay character positions on a tablet.
    Box(modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Row(
            Modifier.fillMaxWidth().widthIn(max = 360.dp).heightIn(min = 56.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            repeat(OTP_LENGTH) { index ->
                Cell(
                    digit = value.getOrNull(index),
                    active = enabled && index == value.length,
                    isError = isError,
                    // No `aspectRatio`: a square cell on a narrow screen would fall below the touch minimum. Height is pinned.
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun Cell(
    digit: Char?,
    active: Boolean,
    isError: Boolean,
    modifier: Modifier = Modifier,
) {
    val rule =
        when {
            isError -> MaterialTheme.colorScheme.error
            active -> MaterialTheme.colorScheme.primary
            digit != null -> MaterialTheme.colorScheme.onSurface
            else -> MaterialTheme.colorScheme.outline
        }

    Box(
        modifier
            // 56dp, matching the plain variant.
            .heightIn(min = 56.dp)
            .background(MaterialTheme.colorScheme.surfaceContainerLow, RoundedCornerShape(12.dp)),
        contentAlignment = Alignment.Center,
    ) {
        if (digit != null) {
            Text(
                digit.toString(),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center,
            )
        }
        Box(
            Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 10.dp)
                .width(20.dp)
                .height(2.dp)
                .alpha(if (active) pulse() else 1f)
                .background(if (digit != null && !isError) Color.Transparent else rule),
        )
    }
}

/** The caret stand-in: the active cell's rule breathes, showing where the next digit lands. */
@Composable
private fun pulse(): Float {
    val transition = rememberInfiniteTransition(label = "otp-caret")
    val alpha by
        transition.animateFloat(
            initialValue = 1f,
            targetValue = 0.25f,
            animationSpec =
                infiniteRepeatable(tween(durationMillis = 650), repeatMode = RepeatMode.Reverse),
            label = "otp-caret-alpha",
        )
    return alpha
}
