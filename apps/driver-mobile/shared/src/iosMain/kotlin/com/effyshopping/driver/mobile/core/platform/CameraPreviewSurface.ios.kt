package com.effyshopping.driver.mobile.core.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.UIKitView
import kotlinx.cinterop.ExperimentalForeignApi
import platform.AVFoundation.AVAuthorizationStatusAuthorized
import platform.AVFoundation.AVCaptureDevice
import platform.AVFoundation.AVCaptureDeviceInput
import platform.AVFoundation.AVCapturePhoto
import platform.AVFoundation.AVCapturePhotoCaptureDelegateProtocol
import platform.AVFoundation.AVCapturePhotoOutput
import platform.AVFoundation.AVCapturePhotoSettings
import platform.AVFoundation.AVCaptureSession
import platform.AVFoundation.AVCaptureSessionPresetPhoto
import platform.AVFoundation.AVCaptureVideoPreviewLayer
import platform.AVFoundation.AVLayerVideoGravityResizeAspectFill
import platform.AVFoundation.AVMediaTypeVideo
import platform.AVFoundation.authorizationStatusForMediaType
import platform.AVFoundation.fileDataRepresentation
import platform.CoreGraphics.CGRectMake
import platform.Foundation.NSError
import platform.UIKit.UIImage
import platform.UIKit.UIView
import platform.darwin.DISPATCH_QUEUE_PRIORITY_DEFAULT
import platform.darwin.NSObject
import platform.darwin.dispatch_async
import platform.darwin.dispatch_get_global_queue
import platform.darwin.dispatch_get_main_queue

/**
 * iOS live viewfinder for photo proof, on AVFoundation like the package scanner. It reports `false` and
 * draws nothing unless the camera is already allowed; the shutter then hands off to the system camera, which
 * asks itself. The photo is made upright and shrunk like the system-camera path (`toProofJpeg`).
 */
@OptIn(ExperimentalForeignApi::class)
@Composable
actual fun CameraPreviewSurface(
    modifier: Modifier,
    controller: CameraCaptureController,
    onCaptured: (ByteArray) -> Unit,
): Boolean {
    val allowed = remember { AVCaptureDevice.authorizationStatusForMediaType(AVMediaTypeVideo) == AVAuthorizationStatusAuthorized }
    val device = remember { if (allowed) AVCaptureDevice.defaultDeviceWithMediaType(AVMediaTypeVideo) else null }
    if (device == null) return false

    val latest = rememberUpdatedState(onCaptured)
    // Held for the composable's life: the photo output keeps only a weak reference to its delegate.
    val delegate = remember { ProofPhotoDelegate { bytes -> latest.value(bytes) } }
    val session = remember { AVCaptureSession().apply { sessionPreset = AVCaptureSessionPresetPhoto } }
    val preview = remember {
        AVCaptureVideoPreviewLayer(session = session).apply { videoGravity = AVLayerVideoGravityResizeAspectFill }
    }

    DisposableEffect(device) {
        val input = AVCaptureDeviceInput.deviceInputWithDevice(device, null) as? AVCaptureDeviceInput
        val output = AVCapturePhotoOutput()
        val ready = input != null && session.canAddInput(input) && session.canAddOutput(output)
        if (ready) {
            session.addInput(input!!)
            session.addOutput(output)
            controller.capture = { output.capturePhotoWithSettings(AVCapturePhotoSettings(), delegate) }
            // startRunning blocks; never on the main thread.
            dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT.toLong(), 0u)) { session.startRunning() }
        }
        onDispose {
            controller.capture = null
            session.stopRunning()
            if (ready) {
                session.removeInput(input!!)
                session.removeOutput(output)
            }
        }
    }

    UIKitView(factory = { ViewfinderView(preview) }, modifier = modifier)
    return true
}

/** A plain view whose only layer is the camera preview, kept the size of the view. */
@OptIn(ExperimentalForeignApi::class)
private class ViewfinderView(private val preview: AVCaptureVideoPreviewLayer) : UIView(frame = CGRectMake(0.0, 0.0, 0.0, 0.0)) {
    init {
        layer.addSublayer(preview)
    }

    override fun layoutSubviews() {
        super.layoutSubviews()
        preview.frame = bounds
    }
}

/**
 * Receives the captured photo, shrinks it off the main thread and hands the JPEG back on it.
 * A failed capture is swallowed, like Android's: the viewfinder stays up and the driver presses again.
 */
private class ProofPhotoDelegate(private val onBytes: (ByteArray) -> Unit) : NSObject(), AVCapturePhotoCaptureDelegateProtocol {
    override fun captureOutput(output: AVCapturePhotoOutput, didFinishProcessingPhoto: AVCapturePhoto, error: NSError?) {
        if (error != null) return
        val data = didFinishProcessingPhoto.fileDataRepresentation() ?: return
        dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT.toLong(), 0u)) {
            val bytes = UIImage(data = data).toProofJpeg()
            if (bytes.isNotEmpty()) dispatch_async(dispatch_get_main_queue()) { onBytes(bytes) }
        }
    }
}
