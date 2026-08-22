package com.effyshopping.driver.mobile.core.platform

import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import java.io.ByteArrayOutputStream

/**
 * Android photo capture via the system camera (ActivityResult `TakePicturePreview` — a thumbnail
 * Bitmap, which is ample for proof-of-delivery and needs no FileProvider/URI plumbing). The OS handles
 * the camera permission prompt on first use.
 */
@Composable
actual fun rememberPhotoCapture(onCaptured: (ByteArray) -> Unit): (() -> Unit)? {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bitmap: Bitmap? ->
        if (bitmap != null) {
            val out = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
            onCaptured(out.toByteArray())
        }
    }
    return { launcher.launch(null) }
}
