package com.effyshopping.driver.mobile.core.scan

import androidx.compose.foundation.focusable
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.utf16CodePoint

/**
 * A handheld (bluetooth) barcode scanner, paired with the phone.
 *
 * Such a scanner is a keyboard: reading a label, it types `EFY1:5MQKVF` and (usually) presses Enter. This
 * collects those keystrokes into one read. Pure, so it is tested without a device.
 *
 * A read is taken the moment a whole package token has arrived - not at Enter. Scanners are configured
 * to end with Enter, Tab or nothing at all; waiting for a suffix would make one of those never count.
 * Whatever follows the token (the Enter) lands in an empty buffer and is ignored.
 *
 * Letters are upper-cased: a scanner types as the phone's keyboard state says, and Caps Lock on a
 * paired keyboard turns `EFY1:5MQKVF` into `efy1:5mqkvf`. Nothing else is forgiven - what is left goes
 * through [PackageToken.parse], the one rule for what a label says.
 */
class KeyboardWedge {
    private val buffer = StringBuilder()

    /** One typed character. Answers the token when it completes one; null otherwise. */
    fun type(char: Char): String? {
        buffer.append(char.uppercaseChar())
        // Only the tail can be a token: a stray key typed before the scan must not spoil it.
        val start = buffer.lastIndexOf(PackageToken.PREFIX)
        if (start < 0) {
            if (buffer.length > TOKEN_LENGTH) buffer.deleteRange(0, buffer.length - TOKEN_LENGTH)
            return null
        }
        val tail = buffer.substring(start)
        if (tail.length < TOKEN_LENGTH) return null
        buffer.clear()
        return tail.takeIf { PackageToken.parse(it) != null }
    }

    /** Enter, Tab, or any key that is not a character: whatever was typed is not a label. */
    fun end() {
        buffer.clear()
    }

    private companion object {
        val TOKEN_LENGTH = PackageToken.PREFIX.length + 6
    }
}

private val LETTERS: Map<Key, Char> = listOf(
    Key.A, Key.B, Key.C, Key.D, Key.E, Key.F, Key.G, Key.H, Key.I, Key.J, Key.K, Key.L, Key.M,
    Key.N, Key.O, Key.P, Key.Q, Key.R, Key.S, Key.T, Key.U, Key.V, Key.W, Key.X, Key.Y, Key.Z,
).mapIndexed { i, k -> k to ('A' + i) }.toMap()

private val DIGITS: Map<Key, Char> =
    listOf(Key.Zero, Key.One, Key.Two, Key.Three, Key.Four, Key.Five, Key.Six, Key.Seven, Key.Eight, Key.Nine)
        .mapIndexed { i, k -> k to ('0' + i) }.toMap() +
        listOf(Key.NumPad0, Key.NumPad1, Key.NumPad2, Key.NumPad3, Key.NumPad4, Key.NumPad5, Key.NumPad6, Key.NumPad7, Key.NumPad8, Key.NumPad9)
            .mapIndexed { i, k -> k to ('0' + i) }.toMap()

/**
 * The character a key types when the event carries none. Not every platform puts the character on a
 * hardware key event (the iOS test harness does not), so the label's characters - letters, digits and
 * the colon (Shift +;) - are worked out from the key itself. Nothing else is needed for a label.
 */
internal fun keyChar(key: Key, shift: Boolean): Char? = when {
    key == Key.Semicolon -> if (shift) ':' else ';'
    else -> LETTERS[key] ?: DIGITS[key]?.takeUnless { shift }
}

/**
 * Listens for a paired scanner while [enabled], and hands each label it reads to [onRead] - the same
 * value, and the same rule, as the camera's read.
 *
 * Keystrokes reach only what has focus, so this takes it - and takes it back whenever it is enabled
 * again (the type-a-code sheet, which has its own field, borrows it while open).
 */
@Composable
fun Modifier.hardwareScanner(enabled: Boolean, onRead: (String) -> Unit): Modifier {
    val focus = remember { FocusRequester() }
    val wedge = remember { KeyboardWedge() }
    LaunchedEffect(enabled) { if (enabled) runCatching { focus.requestFocus() } }
    return this
        .onPreviewKeyEvent { event ->
            if (!enabled) return@onPreviewKeyEvent false
            if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
            when (event.key) {
                Key.Enter, Key.NumPadEnter, Key.Tab -> {
                    wedge.end()
                    true
                }
                else -> {
                    val char = event.utf16CodePoint.takeIf { it > 0x20 }?.toChar()
                        ?: keyChar(event.key, event.isShiftPressed)
                        ?: return@onPreviewKeyEvent false // a modifier or a control key
                    wedge.type(char)?.let(onRead)
                    true
                }
            }
        }
        .focusRequester(focus)
        .focusable(enabled)
}
