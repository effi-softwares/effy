@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)

package com.effyshopping.mobile.kit.ui

import androidx.compose.foundation.layout.fillMaxWidth
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
import kotlinx.cinterop.readValue
import platform.CoreGraphics.CGRectMake
import platform.CoreGraphics.CGRectZero
import platform.UIKit.NSLayoutConstraint
import platform.UIKit.NSTextAlignmentCenter
import platform.UIKit.UIColor
import platform.UIKit.UIFont
import platform.UIKit.UIFontWeightMedium
import platform.UIKit.UILabel
import platform.UIKit.UILayoutConstraintAxisHorizontal
import platform.UIKit.UIStackView
import platform.UIKit.UIStackViewDistributionFillEqually
import platform.UIKit.UIView
import platform.UIKit.UIKeyboardTypeNumberPad
import platform.UIKit.UIReturnKeyType
import platform.UIKit.UITextContentTypeOneTimeCode
import platform.UIKit.UITextField
import platform.UIKit.UITextFieldDelegateProtocol
import platform.UIKit.UITextFieldViewMode
import platform.UIKit.accessibilityLabel
import platform.UIKit.accessibilityValue
import platform.darwin.NSObject

/** A native `UITextField`: only `textContentType = UITextContentTypeOneTimeCode` gets iOS to offer the code from Mail or Messages. */
private class OtpTextFieldDelegate(
    var onChange: (String) -> Unit,
    var onSubmit: () -> Unit,
) : NSObject(), UITextFieldDelegateProtocol {
    // Intercepts every edit, paste included, and returns false so Kotlin owns the text and `normalizeOtp` sees it.
    override fun textField(
        textField: UITextField,
        shouldChangeCharactersInRange: CValue<NSRange>,
        replacementString: String,
    ): Boolean {
        val current = textField.text.orEmpty()
        val start = shouldChangeCharactersInRange.useContents { location.toInt() }.coerceIn(0, current.length)
        val length = shouldChangeCharactersInRange.useContents { length.toInt() }
        val end = (start + length).coerceIn(start, current.length)
        // Strips non-digits only; never truncates.
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
     * The cells are drawn in UIKit behind the real `UITextField`, which is made transparent (`textColor`
     * and `tintColor` cleared, no background, border or placeholder). Never `hidden` or `alpha = 0`: iOS
     * withholds the one-time-code suggestion from a field it considers off-screen. The field is on top,
     * so every touch reaches it; the cells carry no semantics, so VoiceOver sees one element.
     */
    variant: OtpVariant,
) {
    val change = rememberUpdatedState(onValueChange)
    val submit = rememberUpdatedState(onSubmit)
    val delegate = remember { OtpTextFieldDelegate({ change.value(it) }, { submit.value() }) }
    delegate.onChange = { change.value(it) }
    delegate.onSubmit = { submit.value() }

    val cells = variant == OtpVariant.Cells
    val surface = MaterialTheme.colorScheme.surfaceContainerLow.asUIColor()
    val foreground = MaterialTheme.colorScheme.onSurface.asUIColor()
    val outline = MaterialTheme.colorScheme.outline.asUIColor()
    val errorColor = MaterialTheme.colorScheme.error.asUIColor()
    val primary = MaterialTheme.colorScheme.primary.asUIColor()
    val border = (if (isError) errorColor else outline)
    val cursor = primary

    UIKitView(
        factory = {
            val field = UITextField().apply {
                this.delegate = delegate
                keyboardType = UIKeyboardTypeNumberPad
                returnKeyType = UIReturnKeyType.UIReturnKeyDone
                textContentType = UITextContentTypeOneTimeCode
                accessibilityLabel = "One-time code"
                tag = FIELD_TAG.toLong()
                if (!cells) {
                    placeholder = "$OTP_LENGTH-digit code"
                    layer.cornerRadius = 16.0
                    layer.borderWidth = 1.0
                    leftView = UIView(frame = CGRectMake(0.0, 0.0, 16.0, 1.0))
                    leftViewMode = UITextFieldViewMode.UITextFieldViewModeAlways
                }
            }
            if (!cells) return@UIKitView field

            // The six cells, drawn in UIKit
            val container = UIView(frame = CGRectZero.readValue())
            val stack = UIStackView().apply {
                axis = UILayoutConstraintAxisHorizontal
                distribution = UIStackViewDistributionFillEqually
                spacing = 8.0
                translatesAutoresizingMaskIntoConstraints = false
            }
            repeat(OTP_LENGTH) { index ->
                val cell = UIView().apply {
                    layer.cornerRadius = 12.0
                    layer.borderWidth = 1.0
                    tag = (CELL_TAG + index).toLong()
                }
                val label = UILabel().apply {
                    textAlignment = NSTextAlignmentCenter
                    font = UIFont.systemFontOfSize(22.0, UIFontWeightMedium)
                    tag = (LABEL_TAG + index).toLong()
                    translatesAutoresizingMaskIntoConstraints = false
                }
                cell.addSubview(label)
                NSLayoutConstraint.activateConstraints(
                    listOf(
                        label.centerXAnchor.constraintEqualToAnchor(cell.centerXAnchor),
                        label.centerYAnchor.constraintEqualToAnchor(cell.centerYAnchor),
                    ),
                )
                stack.addArrangedSubview(cell)
            }
            container.addSubview(stack)

            // The transparent field over the cells receives input, paste and the one-time-code suggestion.
            field.translatesAutoresizingMaskIntoConstraints = false
            container.addSubview(field)

            NSLayoutConstraint.activateConstraints(
                listOf(
                    stack.leadingAnchor.constraintEqualToAnchor(container.leadingAnchor),
                    stack.trailingAnchor.constraintEqualToAnchor(container.trailingAnchor),
                    stack.topAnchor.constraintEqualToAnchor(container.topAnchor),
                    stack.bottomAnchor.constraintEqualToAnchor(container.bottomAnchor),
                    field.leadingAnchor.constraintEqualToAnchor(container.leadingAnchor),
                    field.trailingAnchor.constraintEqualToAnchor(container.trailingAnchor),
                    field.topAnchor.constraintEqualToAnchor(container.topAnchor),
                    field.bottomAnchor.constraintEqualToAnchor(container.bottomAnchor),
                ),
            )
            container
        },
        update = { root ->
            val field = (root.viewWithTag(FIELD_TAG.toLong()) as? UITextField) ?: return@UIKitView
            if (field.text != value) field.text = value
            field.enabled = enabled
            field.accessibilityValue = value

            if (!cells) {
                field.backgroundColor = surface
                field.textColor = foreground
                field.tintColor = cursor
                field.layer.borderColor = border.CGColor
                return@UIKitView
            }

            // Transparent but laid out and first-responder-capable; never `hidden`/`alpha = 0` (see `variant`).
            field.backgroundColor = UIColor.clearColor
            field.textColor = UIColor.clearColor
            field.tintColor = UIColor.clearColor
            field.layer.borderWidth = 0.0

            repeat(OTP_LENGTH) { index ->
                val cell = root.viewWithTag((CELL_TAG + index).toLong())
                val label = root.viewWithTag((LABEL_TAG + index).toLong()) as? UILabel
                val digit = value.getOrNull(index)
                val active = enabled && index == value.length
                label?.text = digit?.toString() ?: ""
                label?.textColor = foreground
                cell?.backgroundColor = surface
                cell?.layer?.borderColor = when {
                    isError -> errorColor.CGColor
                    active -> primary.CGColor
                    else -> outline.CGColor
                }
                cell?.layer?.borderWidth = if (active) 2.0 else 1.0
            }
        },
        // `fillMaxWidth`, as on Android, or the `UIKitView` hugs the field's intrinsic width.
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .semantics {
                contentDescription = "One-time code"
                if (isError) error("Check the one-time code")
            },
        properties = UIKitInteropProperties(isNativeAccessibilityEnabled = true),
    )
}

/** Tags, so `update` finds the views `factory` built without holding Kotlin references. */
private const val FIELD_TAG = 4001
private const val CELL_TAG = 4100
private const val LABEL_TAG = 4200

private fun Color.asUIColor(): UIColor {
    val argb = toArgb()
    return UIColor.colorWithRed(
        red = ((argb shr 16) and 0xff) / 255.0,
        green = ((argb shr 8) and 0xff) / 255.0,
        blue = (argb and 0xff) / 255.0,
        alpha = ((argb ushr 24) and 0xff) / 255.0,
    )
}
