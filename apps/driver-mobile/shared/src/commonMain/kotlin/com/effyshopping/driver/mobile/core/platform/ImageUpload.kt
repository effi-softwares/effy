package com.effyshopping.driver.mobile.core.platform

/**
 * PUT raw bytes to a presigned S3 URL (049 US2 proof upload). Platform-specific because the presigned
 * URL is absolute and must be called WITHOUT the driver bearer (the signature IS the authorization);
 * the app's Ktor client injects the bearer, so a plain platform HTTP client is used here instead.
 * Returns true on a 2xx.
 */
expect suspend fun uploadBytes(url: String, bytes: ByteArray, contentType: String): Boolean
