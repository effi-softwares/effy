package com.effyshopping.driver.mobile.core.platform

import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.usePinned
import kotlinx.coroutines.suspendCancellableCoroutine
import platform.Foundation.NSData
import platform.Foundation.NSMutableURLRequest
import platform.Foundation.NSURL
import platform.Foundation.NSURLSession
import platform.Foundation.NSHTTPURLResponse
import platform.Foundation.create
import platform.Foundation.dataTaskWithRequest
import platform.Foundation.setHTTPBody
import platform.Foundation.setHTTPMethod
import platform.Foundation.setValue
import kotlin.coroutines.resume

@OptIn(ExperimentalForeignApi::class)
actual suspend fun uploadBytes(url: String, bytes: ByteArray, contentType: String): Boolean =
    suspendCancellableCoroutine { cont ->
        val nsData = bytes.usePinned { pinned ->
            NSData.create(bytes = pinned.addressOf(0), length = bytes.size.toULong())
        }
        val request = NSMutableURLRequest(uRL = NSURL(string = url)).apply {
            setHTTPMethod("PUT")
            setValue(contentType, forHTTPHeaderField = "Content-Type")
            setHTTPBody(nsData)
        }
        val task = NSURLSession.sharedSession.dataTaskWithRequest(request) { _, response, error ->
            val ok = error == null && (response as? NSHTTPURLResponse)?.statusCode?.toInt() in 200..299
            if (cont.isActive) cont.resume(ok)
        }
        task.resume()
    }
