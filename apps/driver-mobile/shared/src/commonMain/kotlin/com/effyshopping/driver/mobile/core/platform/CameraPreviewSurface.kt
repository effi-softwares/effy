package com.effyshopping.driver.mobile.core.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier

/**
 * Drives the shutter from the shared screen chrome.
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
 * A live camera viewfinder. The photo-proof screen's chrome (framing guidance, caption bar, shutter, flash,
 * flip) is built once in `commonMain`; only this rectangle is per-platform.
 *
 * @param onCaptured upright JPEG bytes, when a live preview produces an image
 * @return true if a live preview is being rendered. When false the caller shows its stand-in and the
 *  shutter hands off to the system camera.
 */
@Composable
expect fun CameraPreviewSurface(
    modifier: Modifier,
    controller: CameraCaptureController,
    onCaptured: (ByteArray) -> Unit,
): Boolean
