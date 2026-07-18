@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)

package com.effyshopping.shop.mobile.features.auth.presentation

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

private class OtpTextFieldDelegate(
    var onChange: (String) -> Unit,
    var onSubmit: () -> Unit,
) : NSObject(), UITextFieldDelegateProtocol {
    override fun textField(
        textField: UITextField,
        shouldChangeCharactersInRange: CValue<NSRange>,
        replacementString: String,
    ): Boolean {
        val current = textField.text.orEmpty()
        val start = shouldChangeCharactersInRange.useContents { location.toInt() }.coerceIn(0, current.length)
        val length = shouldChangeCharactersInRange.useContents { length.toInt() }
        val end = (start + length).coerceIn(start, current.length)
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
                placeholder = "6-digit code"
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
        modifier = modifier.semantics {
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
