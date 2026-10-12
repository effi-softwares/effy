package com.effyshopping.driver.mobile.core.platform

import android.Manifest
import android.content.pm.PackageManager
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import java.io.ByteArrayOutputStream

/**
 * Android photo capture via the system camera (ActivityResult `TakePicturePreview` — a thumbnail
 * Bitmap, which is ample for proof-of-delivery and needs no FileProvider/URI plumbing).
 *
 * ⚠ THE PERMISSION IS ASKED FOR HERE. This app declares CAMERA in its manifest, and Android refuses
 * the system-camera intent with a SecurityException to an app that declares the permission and does
 * not hold it — so launching without it ended the app at the door. Refused → [onDenied].
 */
@Composable
actual fun rememberPhotoCapture(onCaptured: (ByteArray) -> Unit, onDenied: () -> Unit): (() -> Unit)? {
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bitmap: Bitmap? ->
        if (bitmap != null) {
            val out = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
            onCaptured(out.toByteArray())
        }
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) launcher.launch(null) else onDenied()
    }
    return {
        val held = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
        if (held) launcher.launch(null) else permission.launch(Manifest.permission.CAMERA)
    }
}
