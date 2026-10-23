package com.effyshopping.driver.mobile.core.platform

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

/** The longest side a proof photograph is kept at, in pixels — legible, and well under 1 MB. */
private const val PROOF_MAX_SIDE = 1600
private const val PROOF_JPEG_QUALITY = 80

/**
 * Turn a camera JPEG into proof: upright, the long side at most [PROOF_MAX_SIDE], JPEG at
 * [PROOF_JPEG_QUALITY] (backlog B1). Call it off the main thread — decoding a 12 MP frame takes time.
 *
 * [rotationDegrees] is CameraX's rotation for the frame; when null the photo's own exif orientation is
 * used (the system camera writes a file and records its orientation there). Returns null when the
 * bytes are not an image.
 */
internal fun proofJpeg(jpeg: ByteArray, rotationDegrees: Int? = null): ByteArray? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size, bounds)
    val longSide = maxOf(bounds.outWidth, bounds.outHeight)
    if (longSide <= 0) return null

    // Decode at the smallest power-of-two reduction that stays at or above the target size.
    var sample = 1
    while (longSide / (sample * 2) >= PROOF_MAX_SIDE) sample *= 2
    val decoded = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size, BitmapFactory.Options().apply { inSampleSize = sample })
        ?: return null

    val rotation = rotationDegrees ?: exifRotation(jpeg)
    val scale = minOf(1f, PROOF_MAX_SIDE.toFloat() / maxOf(decoded.width, decoded.height))
    val matrix = Matrix().apply {
        postScale(scale, scale)
        postRotate(rotation.toFloat())
    }
    val upright = if (rotation == 0 && scale == 1f) decoded
    else Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)

    return ByteArrayOutputStream().use { out ->
        upright.compress(Bitmap.CompressFormat.JPEG, PROOF_JPEG_QUALITY, out)
        if (upright !== decoded) upright.recycle()
        decoded.recycle()
        out.toByteArray()
    }
}

private fun exifRotation(jpeg: ByteArray): Int = runCatching {
    when (ExifInterface(ByteArrayInputStream(jpeg)).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
        ExifInterface.ORIENTATION_ROTATE_90 -> 90
        ExifInterface.ORIENTATION_ROTATE_180 -> 180
        ExifInterface.ORIENTATION_ROTATE_270 -> 270
        else -> 0
    }
}.getOrDefault(0)
