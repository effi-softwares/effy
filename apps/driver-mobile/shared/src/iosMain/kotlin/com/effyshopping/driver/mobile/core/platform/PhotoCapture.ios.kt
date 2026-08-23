package com.effyshopping.driver.mobile.core.platform

import androidx.compose.runtime.Composable

/**
 * iOS photo capture. Returns null → the caller hides the Photo option on iOS for now. A real
 * implementation needs a Swift `UIImagePickerController`/`PHPicker` bridge (the same Swift-bridge
 * pattern as auth), captured in a follow-up. Signature + code + contactless proof work on iOS today.
 */
@Composable
actual fun rememberPhotoCapture(onCaptured: (ByteArray) -> Unit): (() -> Unit)? = null
