package com.effyshopping.driver.mobile.core.platform

import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asSkiaBitmap
import org.jetbrains.skia.Image
import org.jetbrains.skia.EncodedImageFormat

actual fun ImageBitmap.toPngBytes(): ByteArray {
    val skiaImage = Image.makeFromBitmap(asSkiaBitmap())
    val data = skiaImage.encodeToData(EncodedImageFormat.PNG)
        ?: return ByteArray(0)
    return data.bytes
}
