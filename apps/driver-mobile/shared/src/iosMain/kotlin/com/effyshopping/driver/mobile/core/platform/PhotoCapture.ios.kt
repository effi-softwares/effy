package com.effyshopping.driver.mobile.core.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.useContents
import kotlinx.cinterop.usePinned
import platform.AVFoundation.AVAuthorizationStatusDenied
import platform.AVFoundation.AVAuthorizationStatusRestricted
import platform.AVFoundation.AVCaptureDevice
import platform.AVFoundation.AVMediaTypeVideo
import platform.AVFoundation.authorizationStatusForMediaType
import platform.CoreGraphics.CGRectMake
import platform.CoreGraphics.CGSizeMake
import platform.Foundation.NSData
import platform.UIKit.UIApplication
import platform.UIKit.UIGraphicsBeginImageContextWithOptions
import platform.UIKit.UIGraphicsEndImageContext
import platform.UIKit.UIGraphicsGetImageFromCurrentImageContext
import platform.UIKit.UIImage
import platform.UIKit.UIImagePNGRepresentation
import platform.UIKit.UIImagePickerController
import platform.UIKit.UIImagePickerControllerDelegateProtocol
import platform.UIKit.UIImagePickerControllerOriginalImage
import platform.UIKit.UIImagePickerControllerSourceType
import platform.UIKit.UINavigationControllerDelegateProtocol
import platform.UIKit.UIViewController
import platform.darwin.NSObject
import platform.posix.memcpy

/**
 * iOS photo capture through the system camera (`UIImagePickerController`).
 *
 * ⚠ This returned `null`, and the proof screen's shutter calls it — so on iOS the shutter did
 * nothing. Photo proof was impossible, and so was a contactless drop, which must be photographed
 * (064): an iOS driver could complete a delivery by signature only.
 *
 * The photograph is scaled down before it is encoded: a full-resolution camera frame as a PNG is
 * several times the platform's upload ceiling, and proof needs to be legible, not large.
 *
 * ⚠ A device with no camera — the simulator — falls back to the photo library so the flow can be
 * walked there. Every iPhone a driver carries has a camera, so a driver never sees that path.
 * Needs `NSCameraUsageDescription` in the app's Info.plist; without it iOS ends the app at first use.
 */
@Composable
actual fun rememberPhotoCapture(onCaptured: (ByteArray) -> Unit, onDenied: () -> Unit): (() -> Unit)? {
    val latest = rememberUpdatedState(onCaptured)
    val denied = rememberUpdatedState(onDenied)
    // Held for the composable's life: the picker keeps only a weak reference to its delegate.
    val delegate = remember { PhotoPickerDelegate { bytes -> latest.value(bytes) } }
    return remember {
        launch@{
            // A refused camera opens as a black viewfinder with no explanation; say so instead.
            val status = AVCaptureDevice.authorizationStatusForMediaType(AVMediaTypeVideo)
            if (status == AVAuthorizationStatusDenied || status == AVAuthorizationStatusRestricted) {
                denied.value()
                return@launch
            }
            val camera = UIImagePickerControllerSourceType.UIImagePickerControllerSourceTypeCamera
            val picker = UIImagePickerController()
            picker.sourceType = if (UIImagePickerController.isSourceTypeAvailable(camera)) {
                camera
            } else {
                UIImagePickerControllerSourceType.UIImagePickerControllerSourceTypePhotoLibrary
            }
            picker.delegate = delegate
            topViewController()?.presentViewController(picker, animated = true, completion = null)
        }
    }
}

private class PhotoPickerDelegate(
    private val onBytes: (ByteArray) -> Unit,
) : NSObject(), UIImagePickerControllerDelegateProtocol, UINavigationControllerDelegateProtocol {

    override fun imagePickerController(
        picker: UIImagePickerController,
        didFinishPickingMediaWithInfo: Map<Any?, *>,
    ) {
        val image = didFinishPickingMediaWithInfo[UIImagePickerControllerOriginalImage] as? UIImage
        picker.dismissViewControllerAnimated(true, completion = null)
        val bytes = image?.toProofPng() ?: return
        if (bytes.isNotEmpty()) onBytes(bytes)
    }

    override fun imagePickerControllerDidCancel(picker: UIImagePickerController) {
        picker.dismissViewControllerAnimated(true, completion = null)
    }
}

/** The longest side a proof photograph is kept at, in pixels. */
private const val PROOF_MAX_SIDE = 1280.0

@OptIn(ExperimentalForeignApi::class)
private fun UIImage.toProofPng(): ByteArray {
    val (w, h) = size.useContents { width to height }
    if (w <= 0.0 || h <= 0.0) return ByteArray(0)
    val scale = minOf(1.0, PROOF_MAX_SIDE / maxOf(w, h))
    // Drawn into a 1x context: `drawInRect` also bakes in the camera's orientation, which a PNG
    // cannot carry as metadata.
    UIGraphicsBeginImageContextWithOptions(CGSizeMake(w * scale, h * scale), true, 1.0)
    drawInRect(CGRectMake(0.0, 0.0, w * scale, h * scale))
    val scaled = UIGraphicsGetImageFromCurrentImageContext()
    UIGraphicsEndImageContext()
    val data: NSData = scaled?.let { UIImagePNGRepresentation(it) } ?: return ByteArray(0)
    val length = data.length.toInt()
    if (length == 0) return ByteArray(0)
    return ByteArray(length).also { out ->
        out.usePinned { pinned -> memcpy(pinned.addressOf(0), data.bytes, data.length) }
    }
}

/** The controller currently on screen — what a picker has to be presented from. */
private fun topViewController(): UIViewController? {
    var top = UIApplication.sharedApplication.keyWindow?.rootViewController
    while (true) top = top?.presentedViewController ?: break
    return top
}
