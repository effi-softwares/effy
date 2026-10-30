package com.effyshopping.driver.mobile.core.platform

import android.Manifest
import android.content.pm.PackageManager
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
import java.util.concurrent.Executors

/**
 * A live CameraX viewfinder.
 *
 * **It reports `false` - and draws nothing - when the camera permission has not been granted.**
 * The caller then renders its stand-in and the shutter hands off to the system camera, which
 * prompts for permission itself. Rendering a black rectangle while silently failing is the worse
 * outcome: the driver sees a broken screen with nothing telling them why.
 *
 * **Binding is tied to the composable's lifetime, not the Activity's.** `DisposableEffect`
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

    val imageCapture = remember {
        ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).build()
    }
    val previewView = remember { PreviewView(context) }

    DisposableEffect(lifecycleOwner) {
        val worker = Executors.newSingleThreadExecutor()
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

        val main = ContextCompat.getMainExecutor(context)
        controller.capture = {
            // The frame is decoded and re-encoded on the worker, never the main thread (backlog B1).
            imageCapture.takePicture(
                worker,
                object : ImageCapture.OnImageCapturedCallback() {
                    override fun onCaptureSuccess(image: ImageProxy) {
                        val bytes = runCatching { image.toProofJpeg() }.getOrNull()
                        image.close()
                        if (bytes != null) main.execute { onCaptured(bytes) }
                    }

                    // Swallowed deliberately: a failed shutter must not crash a driver mid-drop.
                    // The screen stays on the viewfinder so they can simply press it again.
                    override fun onError(exception: ImageCaptureException) = Unit
                },
            )
        }

        onDispose {
            controller.capture = null
            runCatching { future.get().unbindAll() }
            worker.shutdown()
        }
    }

    AndroidView(factory = { previewView }, modifier = modifier)
    return true
}

/** CameraX's in-memory capture is a JPEG in one plane; [proofJpeg] makes it upright and small. */
private fun ImageProxy.toProofJpeg(): ByteArray? {
    val buffer = planes[0].buffer
    val bytes = ByteArray(buffer.remaining())
    buffer.get(bytes)
    return proofJpeg(bytes, imageInfo.rotationDegrees)
}
