package com.effyshopping.driver.mobile.core.scan

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.UIKitView
import kotlinx.cinterop.ExperimentalForeignApi
import platform.AVFoundation.AVAuthorizationStatusDenied
import platform.AVFoundation.AVAuthorizationStatusRestricted
import platform.AVFoundation.AVCaptureConnection
import platform.AVFoundation.AVCaptureDevice
import platform.AVFoundation.AVCaptureDeviceInput
import platform.AVFoundation.AVCaptureMetadataOutput
import platform.AVFoundation.AVCaptureMetadataOutputObjectsDelegateProtocol
import platform.AVFoundation.AVCaptureOutput
import platform.AVFoundation.AVCaptureSession
import platform.AVFoundation.AVCaptureTorchModeOff
import platform.AVFoundation.AVCaptureTorchModeOn
import platform.AVFoundation.AVCaptureVideoPreviewLayer
import platform.AVFoundation.AVLayerVideoGravityResizeAspectFill
import platform.AVFoundation.AVMediaTypeVideo
import platform.AVFoundation.AVMetadataMachineReadableCodeObject
import platform.AVFoundation.AVMetadataObjectTypeCode128Code
import platform.AVFoundation.AVMetadataObjectTypeQRCode
import platform.AVFoundation.authorizationStatusForMediaType
import platform.AVFoundation.hasTorch
import platform.AVFoundation.torchMode
import platform.CoreGraphics.CGRectMake
import platform.UIKit.UIView
import platform.darwin.DISPATCH_QUEUE_PRIORITY_DEFAULT
import platform.darwin.NSObject
import platform.darwin.dispatch_async
import platform.darwin.dispatch_get_global_queue
import platform.darwin.dispatch_get_main_queue

/**
 * iOS: AVFoundation's metadata output, restricted to QR and Code 128, written in Kotlin/Native — no
 * Swift bridge is needed for AVFoundation. Works on every supported iPhone (VisionKit's scanner needs
 * iOS 16 and an A12, so it is not the only path). Needs `NSCameraUsageDescription`, which photo proof
 * already declares.
 */
@OptIn(ExperimentalForeignApi::class)
@Composable
actual fun PackageScanner(
    modifier: Modifier,
    torchOn: Boolean,
    onCode: (String) -> Unit,
    onUnavailable: (ScannerUnavailable) -> Unit,
) {
    val unavailable by rememberUpdatedState(onUnavailable)
    val status = remember { AVCaptureDevice.authorizationStatusForMediaType(AVMediaTypeVideo) }
    if (status == AVAuthorizationStatusDenied || status == AVAuthorizationStatusRestricted) {
        LaunchedEffect(Unit) { unavailable(ScannerUnavailable.PERMISSION_REFUSED) }
        return
    }
    val device = remember { AVCaptureDevice.defaultDeviceWithMediaType(AVMediaTypeVideo) }
    if (device == null) {
        LaunchedEffect(Unit) { unavailable(ScannerUnavailable.NO_CAMERA) }
        return
    }

    val handle = rememberLabelReads(onCode)
    // Held for the composable's life: the output keeps only a weak reference to its delegate.
    val delegate = remember { LabelMetadataDelegate { handle(it) } }
    val session = remember { AVCaptureSession() }
    val preview = remember {
        AVCaptureVideoPreviewLayer(session = session).apply { videoGravity = AVLayerVideoGravityResizeAspectFill }
    }

    DisposableEffect(device) {
        val input = AVCaptureDeviceInput.deviceInputWithDevice(device, null) as? AVCaptureDeviceInput
        val output = AVCaptureMetadataOutput()
        if (input != null && session.canAddInput(input) && session.canAddOutput(output)) {
            session.addInput(input)
            session.addOutput(output)
            output.setMetadataObjectsDelegate(delegate, dispatch_get_main_queue())
            // Set after the output joins the session: before, the available types are empty.
            output.metadataObjectTypes = listOf(AVMetadataObjectTypeQRCode, AVMetadataObjectTypeCode128Code)
            // startRunning blocks; never on the main thread.
            dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT.toLong(), 0u)) { session.startRunning() }
        } else {
            unavailable(ScannerUnavailable.NO_CAMERA)
        }
        onDispose {
            session.stopRunning()
            if (input != null) session.removeInput(input)
            session.removeOutput(output)
        }
    }

    LaunchedEffect(torchOn) {
        if (device.hasTorch && device.lockForConfiguration(null)) {
            device.torchMode = if (torchOn) AVCaptureTorchModeOn else AVCaptureTorchModeOff
            device.unlockForConfiguration()
        }
    }

    UIKitView(factory = { PreviewHostView(preview) }, modifier = modifier)
}

/** A plain view whose only layer is the camera preview, kept the size of the view. */
@OptIn(ExperimentalForeignApi::class)
private class PreviewHostView(private val preview: AVCaptureVideoPreviewLayer) : UIView(frame = CGRectMake(0.0, 0.0, 0.0, 0.0)) {
    init {
        layer.addSublayer(preview)
    }

    override fun layoutSubviews() {
        super.layoutSubviews()
        preview.frame = bounds
    }
}

private class LabelMetadataDelegate(private val onValue: (String) -> Unit) :
    NSObject(), AVCaptureMetadataOutputObjectsDelegateProtocol {
    override fun captureOutput(
        output: AVCaptureOutput,
        didOutputMetadataObjects: List<*>,
        fromConnection: AVCaptureConnection,
    ) {
        didOutputMetadataObjects.forEach { o -> (o as? AVMetadataMachineReadableCodeObject)?.stringValue?.let(onValue) }
    }
}
