package com.effyshopping.driver.mobile.core.platform

/**
 * PUT raw bytes to a presigned S3 URL, with a plain platform HTTP client: the signature is the
 * authorization, and the app's Ktor client would add the driver bearer. True on a 2xx.
 */
expect suspend fun uploadBytes(url: String, bytes: ByteArray, contentType: String): Boolean
