package com.effyshopping.mobile.kit.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp

@Composable
actual fun OtpInput(
    value: String,
    onValueChange: (String) -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier,
    enabled: Boolean,
    isError: Boolean,
    variant: OtpVariant,
) {
    val borderColor = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.outline
    val shape = RoundedCornerShape(16.dp)
    BasicTextField(
        value = value,
        // ⚠ `normalizeOtp` strips non-digits and NOTHING ELSE — it does not truncate. See the note
        // on that function: truncating a longer paste to six is the defect this slice fixes.
        onValueChange = { onValueChange(normalizeOtp(it)) },
        enabled = enabled,
        singleLine = true,
        textStyle = MaterialTheme.typography.titleLarge.copy(color = MaterialTheme.colorScheme.onSurface),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { onSubmit() }),
        cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
        modifier = modifier
            .fillMaxWidth()
            // 56dp clears the constitution's fat-finger minimum of 48dp with room to spare.
            // ⚠ Stated as a measured fact, not a comment claiming compliance — 033 shipped a 32dp
            // control under a comment asserting it cleared the minimum.
            .heightIn(min = 56.dp)
            .semantics {
                contentDescription = "One-time code"
                if (isError) error("Check the one-time code")
            },
        decorationBox = { inner ->
            // ⚠ The cells branch does NOT call `inner()`, on purpose. `OtpCells` paints the glyphs
            // itself from `value`; rendering the inner field as well would draw the real text on top
            // of the cells. See the note on `OtpCells` for what that costs (caret, selection) and why
            // it is the right trade here.
            if (variant == OtpVariant.Cells) {
                OtpCells(value = value, isError = isError, enabled = enabled)
            } else {
                Box(
                    Modifier
                        .background(MaterialTheme.colorScheme.surfaceContainerLow, shape)
                        .border(1.dp, borderColor, shape)
                        .padding(horizontal = 18.dp, vertical = 14.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    if (value.isEmpty()) {
                        Text("$OTP_LENGTH-digit code", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    inner()
                }
            }
        },
    )
}
