package com.effyshopping.driver.mobile.core.platform

import androidx.compose.runtime.Composable

/**
 * Camera photo capture, `expect/actual @Composable`. Returns a launch lambda, or null when capture is
 * unavailable (the caller hides the Photo option). [onCaptured] gets an upright JPEG, long side at most
 * 1600px; [onDenied] when the driver refused the camera.
 */
@Composable
expect fun rememberPhotoCapture(onCaptured: (ByteArray) -> Unit, onDenied: () -> Unit = {}): (() -> Unit)?
