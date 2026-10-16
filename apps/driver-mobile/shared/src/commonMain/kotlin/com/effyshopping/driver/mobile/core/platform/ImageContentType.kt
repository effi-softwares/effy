package com.effyshopping.driver.mobile.core.platform

/**
 * The media type of proof bytes, read from their signature: JPEG for a photo, PNG for a drawn
 * signature. The presign states it and the upload must match it, so it is never assumed.
 */
fun imageContentType(bytes: ByteArray): String =
    if (bytes.size >= 3 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xD8.toByte() && bytes[2] == 0xFF.toByte()) {
        "image/jpeg"
    } else {
        "image/png"
    }
