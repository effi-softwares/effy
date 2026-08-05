@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)

package com.effyshopping.mobile.kit.ui

import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.UIKitInteropProperties
import androidx.compose.ui.viewinterop.UIKitView
import kotlinx.cinterop.CValue
import kotlinx.cinterop.useContents
import platform.Foundation.NSRange
import platform.UIKit.UIColor
import platform.UIKit.UIKeyboardTypeNumberPad
import platform.UIKit.UIReturnKeyType
import platform.UIKit.UITextContentTypeOneTimeCode
import platform.UIKit.UITextField
import platform.UIKit.UITextFieldDelegateProtocol
import platform.UIKit.UITextFieldViewMode
import platform.UIKit.accessibilityLabel
import platform.UIKit.accessibilityValue
import platform.darwin.NSObject

/**
 * ⚠ A NATIVE `UITextField`, NOT A COMPOSE FIELD — and that is the whole value of this file.
 * `textContentType = UITextContentTypeOneTimeCode` is what makes iOS offer the code from Mail or
 * Messages as a keyboard suggestion. A Compose `TextField` cannot ask for it, so a Compose-only
 * implementation silently loses one-tap autofill (FR-026).
 */
private class OtpTextFieldDelegate(
    var onChange: (String) -> Unit,
    var onSubmit: () -> Unit,
) : NSObject(), UITextFieldDelegateProtocol {
    // Intercepts every edit INCLUDING paste, splices it by hand and returns false so Kotlin — not
    // UIKit — owns the text. That is what lets `normalizeOtp` see a pasted value at all.
    override fun textField(
        textField: UITextField,
        shouldChangeCharactersInRange: CValue<NSRange>,
        replacementString: String,
    ): Boolean {
        val current = textField.text.orEmpty()
        val start = shouldChangeCharactersInRange.useContents { location.toInt() }.coerceIn(0, current.length)
        val length = shouldChangeCharactersInRange.useContents { length.toInt() }
        val end = (start + length).coerceIn(start, current.length)
        // ⚠ Strips non-digits and NOTHING ELSE — no truncation. See `normalizeOtp`.
        onChange(normalizeOtp(current.replaceRange(start, end, replacementString)))
        return false
    }

    override fun textFieldShouldReturn(textField: UITextField): Boolean {
        onSubmit()
        textField.resignFirstResponder()
        return true
    }
}

@Composable
actual fun OtpInput(
    value: String,
    onValueChange: (String) -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier,
    enabled: Boolean,
    isError: Boolean,
    /**
     * ⚠ ACCEPTED AND DELIBERATELY IGNORED, PENDING SPIKE-1 (036 R3c, plan §Spikes).
     *
     * This actual is a NATIVE `UITextField` inside a `UIKitView`, and that is not a stylistic choice:
     * `textContentType = UITextContentTypeOneTimeCode` is what produces the one-tap QuickType
     * suggestion from Mail, and a Compose field cannot request it. Painting Compose cells here means
     * compositing them with a colour-cleared but still-visible, still-first-responder text field —
     * and THREE things could break it, none of which Apple or JetBrains document:
     *
     *   1. whether a colour-cleared field still gets the QuickType one-time-code suggestion
     *      (clear colours are not `hidden`, but `alpha = 0` is known to suppress it);
     *   2. CMP 1.11.x z-order and hit-testing for Compose content over a `UIKitView`;
     *   3. `UIKitInteropProperties(isNativeAccessibilityEnabled = true)` gives UIKit ownership of
     *      accessibility for this subtree, so Compose cells would need `clearAndSetSemantics {}` or a
     *      second a11y node appears — breaking the one-node invariant this component exists to hold.
     *
     * ⚠ AUTOFILL BEATS CELLS. It is the highest-value behaviour in this component and the only part of
     * 036 that can be silently destroyed. Until the spike passes on a physical device, iOS keeps the
     * spaced single field — which is GOV.UK's actually-shipped design, not a degraded fallback — and
     * the parity split is recorded rather than hidden.
     */
    @Suppress("UNUSED_PARAMETER") variant: OtpVariant,
) {
    val change = rememberUpdatedState(onValueChange)
    val submit = rememberUpdatedState(onSubmit)
    val delegate = remember { OtpTextFieldDelegate({ change.value(it) }, { submit.value() }) }
    delegate.onChange = { change.value(it) }
    delegate.onSubmit = { submit.value() }

    val surface = MaterialTheme.colorScheme.surfaceContainerLow.asUIColor()
    val foreground = MaterialTheme.colorScheme.onSurface.asUIColor()
    val border = (if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.outline).asUIColor()
    val cursor = MaterialTheme.colorScheme.primary.asUIColor()

    UIKitView(
        factory = {
            UITextField().apply {
                this.delegate = delegate
                keyboardType = UIKeyboardTypeNumberPad
                returnKeyType = UIReturnKeyType.UIReturnKeyDone
                textContentType = UITextContentTypeOneTimeCode
                placeholder = "$OTP_LENGTH-digit code"
                accessibilityLabel = "One-time code"
                layer.cornerRadius = 16.0
                layer.borderWidth = 1.0
                leftView = platform.UIKit.UIView(frame = platform.CoreGraphics.CGRectMake(0.0, 0.0, 16.0, 1.0))
                leftViewMode = UITextFieldViewMode.UITextFieldViewModeAlways
            }
        },
        update = { field ->
            if (field.text != value) field.text = value
            field.enabled = enabled
            field.backgroundColor = surface
            field.textColor = foreground
            field.tintColor = cursor
            field.layer.borderColor = border.CGColor
            field.accessibilityValue = value
        },
        // ⚠ heightIn ADDED during the promotion (035 T038). The shop-mobile original had no height
        // constraint at all on the iOS side, so the touch target was whatever the caller happened
        // to give it — which is how a control ends up under the 48dp minimum without anyone
        // noticing. 56dp matches the Android actual.
        modifier = modifier
            .heightIn(min = 56.dp)
            .semantics {
                contentDescription = "One-time code"
                if (isError) error("Check the one-time code")
            },
        properties = UIKitInteropProperties(isNativeAccessibilityEnabled = true),
    )
}

private fun Color.asUIColor(): UIColor {
    val argb = toArgb()
    return UIColor.colorWithRed(
        red = ((argb shr 16) and 0xff) / 255.0,
        green = ((argb shr 8) and 0xff) / 255.0,
        blue = (argb and 0xff) / 255.0,
        alpha = ((argb ushr 24) and 0xff) / 255.0,
    )
}
