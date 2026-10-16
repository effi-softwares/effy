package com.effyshopping.driver.mobile.core.platform

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Android photo capture via the system camera — the fallback when the live viewfinder is not
 * running. The camera writes a full-size photo to a file this app owns (FileProvider, authority
 * `<applicationId>.proofphoto`); it is then made upright, shrunk and sent as JPEG ([proofJpeg]).
 *
 * ⚠ It used `TakePicturePreview`, which returns only a thumbnail — too small to settle a dispute
 * (backlog B1).
 *
 * ⚠ THE PERMISSION IS ASKED FOR HERE. This app declares CAMERA in its manifest, and Android refuses
 * the system-camera intent with a SecurityException to an app that declares the permission and does
 * not hold it — so launching without it ended the app at the door. Refused → [onDenied].
 */
@Composable
actual fun rememberPhotoCapture(onCaptured: (ByteArray) -> Unit, onDenied: () -> Unit): (() -> Unit)? {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val file = remember { File(File(context.cacheDir, "proof").apply { mkdirs() }, "capture.jpg") }
    val uri: Uri = remember {
        FileProvider.getUriForFile(context, "${context.packageName}.proofphoto", file)
    }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
        if (!saved) return@rememberLauncherForActivityResult
        scope.launch {
            val bytes = withContext(Dispatchers.Default) {
                runCatching { proofJpeg(file.readBytes()) }.getOrNull().also { file.delete() }
            }
            if (bytes != null) onCaptured(bytes)
        }
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) launcher.launch(uri) else onDenied()
    }
    return {
        val held = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
        if (held) launcher.launch(uri) else permission.launch(Manifest.permission.CAMERA)
    }
}
