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
    /**
     * One box, flowing text. ⚠ The DEFAULT, and that default is load-bearing: `apps/shop-mobile` is
     * out of scope for 036 (FR-044a) and must keep today's rendering byte-for-byte.
     */
    Plain,

    /** Six visible character positions, drawn behind ONE field. */
    Cells,
}

/**
 * Six character cells, drawn from the current value (036 FR-002, R3b).
 *
 * ⚠ ANDROID ONLY, and that is a correction rather than a design. iOS drew these cells for exactly one
 * build and they were INVISIBLE: `UIKitView` composites its native view above the Compose canvas and
 * clears the region beneath it, so anything Compose paints *behind* an interop view is never seen. The
 * iOS actual now builds the same six cells in UIKit, inside the same native view as the text field, so
 * no compositing is involved at all. Do not "share" this composable back to iOS.
 *
 * ⚠ THIS IS DECORATION AROUND ONE FIELD — NOT SIX FIELDS. The editor above it remains a single
 * `BasicTextField` with a single accessibility node named "One-time code". Six real inputs are
 * "several inputs wearing a costume", and they are how screen-reader users lose their place in an OTP
 * form. GOV.UK reached the same conclusion and ships a single input; this simply paints the positions.
 *
 * ⚠ IT DELIBERATELY DOES NOT RENDER `innerTextField()`. The Compose idiom for this draws the glyphs
 * itself from `value`; calling the inner field as well would paint the real text ON TOP of the cells.
 * The cost, stated rather than discovered later: **no caret and no selection handles**. The caret is
 * replaced by a pulsing underline on the active cell, which is what the shopper actually needs — "the
 * next digit goes here". Selection is not a gesture anyone performs on a six-digit code; paste still
 * works through the IME, and `normalizeOtp` still sees it.
 *
 * ⚠ OVER-LENGTH FALLS BACK TO FLOWING TEXT, AND THAT IS THE WHOLE REASON THIS FUNCTION TAKES THE CASE
 * SERIOUSLY. Six cells can only show six characters. An 8-digit paste rendered as cells would LOOK
 * like a six-digit code — visually reproducing the exact truncation defect 035 exists to fix, while
 * `normalizeOtp` was carefully written not to truncate. So when the value is too long the cells are
 * abandoned entirely and every digit is shown, in the error colour, with the submit gate already
 * closed by `isCompleteOtp`.
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
        // ⚠ Not a cell in sight. The person must be able to SEE that what they pasted is not a code
        // from us — that is strictly more informative than showing six digits and a server refusal.
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

    // ⚠ FULL WIDTH, BUT CAPPED. The cells divide the available width equally, so on a phone they fill
    // the column edge to edge — which is the affordance a shopper recognises. Without the cap they
    // keep growing on a tablet or an unconstrained parent and become six wide rectangles instead of
    // six character positions. 360 dp is arithmetic, not a citation: six cells at the ~48 dp touch
    // target plus five 8 dp gaps is ≈ 328 dp, and the published guidance is to keep the group compact
    // and centred rather than let it span a wide layout.
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
                    // ⚠ `aspectRatio` is deliberately NOT used: a square cell at a narrow width would
                    // shrink the height below the touch minimum on a 320 dp device. Height is pinned,
                    // width flexes.
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
            // ⚠ 56dp, matching the plain variant. Measured, not asserted — 033 shipped a 32dp control
            // under a comment claiming it cleared the 48dp minimum.
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

/**
 * The caret stand-in.
 *
 * ⚠ There is no real caret in this variant (see the note on [OtpCells]), so the active cell's rule
 * breathes instead. Without it, a shopper mid-code has no indication of where the next digit lands —
 * which is the one thing a caret was doing for them.
 */
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
