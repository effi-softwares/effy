package com.effyshopping.driver.mobile.core.platform

import androidx.compose.runtime.Composable

/**
 * Camera photo capture (049 US2 — photo proof). `expect/actual @Composable` because launching the
 * camera is platform-specific. Returns a launch lambda, or **null when photo capture is not available**
 * on this platform (the caller then hides the Photo option). Captured bytes arrive via [onCaptured] as
 * a PNG. [onDenied] is called when the driver has refused the camera, so the screen can say so.
 */
@Composable
expect fun rememberPhotoCapture(onCaptured: (ByteArray) -> Unit, onDenied: () -> Unit = {}): (() -> Unit)?
