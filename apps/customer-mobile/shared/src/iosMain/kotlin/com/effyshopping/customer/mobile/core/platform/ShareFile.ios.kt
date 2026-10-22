package com.effyshopping.customer.mobile.core.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.usePinned
import platform.Foundation.NSData
import platform.Foundation.NSTemporaryDirectory
import platform.Foundation.NSURL
import platform.Foundation.create
import platform.Foundation.writeToURL
import platform.UIKit.UIActivityViewController
import platform.UIKit.UIApplication
import platform.UIKit.UIViewController

@OptIn(ExperimentalForeignApi::class)
@Composable
actual fun rememberShareFile(): (bytes: ByteArray, fileName: String, mimeType: String) -> Unit = remember {
    { bytes, fileName, _ ->
        val safe = fileName.replace(Regex("[^A-Za-z0-9 ._-]"), "")
        val url = NSURL.fileURLWithPath(NSTemporaryDirectory() + safe)
        val data = bytes.usePinned { NSData.create(bytes = it.addressOf(0), length = bytes.size.toULong()) }
        if (data.writeToURL(url, atomically = true)) {
            val sheet = UIActivityViewController(activityItems = listOf(url), applicationActivities = null)
            topController()?.presentViewController(sheet, animated = true, completion = null)
        }
    }
}

private fun topController(): UIViewController? {
    var top = UIApplication.sharedApplication.keyWindow?.rootViewController
    while (top?.presentedViewController != null) top = top.presentedViewController
    return top
}
