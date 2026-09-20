package com.effyshopping.driver.mobile.core.platform

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import java.io.ByteArrayOutputStream

/**
 * A live CameraX viewfinder (060 T046).
 *
 * ⚠ **It reports `false` — and draws nothing — when the camera permission has not been granted.**
 * The caller then renders its stand-in and the shutter hands off to the system camera, which
 * prompts for permission itself. Rendering a black rectangle while silently failing is the worse
 * outcome: the driver sees a broken screen with nothing telling them why.
 *
 * ⚠ **Binding is tied to the composable's lifetime, not the Activity's.** `DisposableEffect`
 * unbinds on leaving the screen; without that the camera stays open behind the rest of the app,
 * holding the hardware and the battery for the remainder of a shift.
 */
@Composable
actual fun CameraPreviewSurface(
    modifier: Modifier,
    controller: CameraCaptureController,
    onCaptured: (ByteArray) -> Unit,
): Boolean {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    val granted = remember {
        ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
    }
    if (!granted) return false

    val imageCapture = remember { ImageCapture.Builder().build() }
    val previewView = remember { PreviewView(context) }

    DisposableEffect(lifecycleOwner) {
        val future = ProcessCameraProvider.getInstance(context)
        val listener = Runnable {
            runCatching {
                val provider = future.get()
                val preview = androidx.camera.core.Preview.Builder().build().apply {
                    surfaceProvider = previewView.surfaceProvider
                }
                provider.unbindAll()
                provider.bindToLifecycle(
                    lifecycleOwner,
                    CameraSelector.DEFAULT_BACK_CAMERA,
                    preview,
                    imageCapture,
                )
            }
        }
        future.addListener(listener, ContextCompat.getMainExecutor(context))

        controller.capture = {
            imageCapture.takePicture(
                ContextCompat.getMainExecutor(context),
                object : ImageCapture.OnImageCapturedCallback() {
                    override fun onCaptureSuccess(image: ImageProxy) {
                        runCatching { onCaptured(image.toPngBytes()) }
                        image.close()
                    }

                    // ⚠ Swallowed deliberately: a failed shutter must not crash a driver mid-drop.
                    // The screen stays on the viewfinder so they can simply press it again.
                    override fun onError(exception: ImageCaptureException) = Unit
                },
            )
        }

        onDispose {
            controller.capture = null
            runCatching { future.get().unbindAll() }
        }
    }

    AndroidView(factory = { previewView }, modifier = modifier)
    return true
}

/** CameraX hands back YUV/JPEG planes; the platform's proof upload expects PNG (049). */
private fun ImageProxy.toPngBytes(): ByteArray {
    val buffer = planes[0].buffer
    val bytes = ByteArray(buffer.remaining())
    buffer.get(bytes)
    val bitmap: Bitmap = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        ?: return bytes
    return ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        .toByteArray()
}
