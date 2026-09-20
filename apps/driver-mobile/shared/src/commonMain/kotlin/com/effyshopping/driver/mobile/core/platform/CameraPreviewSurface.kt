package com.effyshopping.driver.mobile.core.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier

/**
 * Drives the shutter from the shared screen chrome (060 US1).
 *
 * The shutter button lives in `commonMain` with the rest of the designed frame; whatever takes the
 * picture lives per-platform. The platform surface publishes a [capture] lambda here, and the
 * chrome calls it. When nothing is published the platform has no live camera and the caller falls
 * back to the system camera.
 */
class CameraCaptureController {
    internal var capture: (() -> Unit)? = null

    /** True when a live preview is running and [take] will work. */
    val isLive: Boolean get() = capture != null

    fun take() { capture?.invoke() }
}

@Composable
fun rememberCameraCaptureController(): CameraCaptureController = remember { CameraCaptureController() }

/**
 * A live camera viewfinder (design screen `proof-photo`).
 *
 * ⚠ **The SCREEN is shared; only this SURFACE is per-platform.** The design's photo-proof screen is
 * an in-app viewfinder with framing guidance, a caption bar and shutter/flash/flip controls. All of
 * that chrome is built once in `commonMain`, so the screen exists identically on both platforms
 * (FR-001). What differs is what fills the rectangle.
 *
 * ⚠ **This closes a live defect on iOS as a side effect.** `rememberPhotoCapture` returns `null`
 * there, so the Photo proof option is **hidden entirely** — iOS drivers have had no photo proof at
 * all since 049. After 060 they do, via the system camera, even before a Swift AVFoundation bridge
 * exists. That bridge is deferred and recorded (plan Complexity Tracking, research R8).
 *
 * @param onCaptured PNG bytes, when a live preview produces an image
 * @return true if a LIVE preview is being rendered. When false the caller shows its stand-in and
 *   the shutter hands off to the system camera.
 */
@Composable
expect fun CameraPreviewSurface(
    modifier: Modifier,
    controller: CameraCaptureController,
    onCaptured: (ByteArray) -> Unit,
): Boolean
