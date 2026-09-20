package com.effyshopping.driver.mobile.core.platform

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * iOS has no live viewfinder yet (060 T047).
 *
 * ⚠ **The SCREEN still exists on iOS** — the shared chrome renders its stand-in, and the shutter
 * hands off to the system camera. That is what keeps FR-001 honest: `proof-photo` is reachable and
 * finished on both platforms; only the rectangle in the middle differs.
 *
 * ⚠ **And it is an improvement, not a gap introduced here.** Before 060, `rememberPhotoCapture`
 * returned `null` on iOS, so the Photo proof option was **hidden entirely** — an iOS driver had no
 * photo proof at all. They do now.
 *
 * A live preview needs a Swift AVFoundation bridge, the same shape as the platform's other deferred
 * iOS bridges (050's `SwiftPushBridge`). Deferred and recorded in the plan's Complexity Tracking and
 * in the provenance register; returning `false` here is the whole of the deferral.
 */
@Composable
actual fun CameraPreviewSurface(
    modifier: Modifier,
    controller: CameraCaptureController,
    onCaptured: (ByteArray) -> Unit,
): Boolean = false
