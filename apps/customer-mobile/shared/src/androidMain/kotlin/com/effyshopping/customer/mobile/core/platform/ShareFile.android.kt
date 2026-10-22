package com.effyshopping.customer.mobile.core.platform

import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import java.io.File

@Composable
actual fun rememberShareFile(): (bytes: ByteArray, fileName: String, mimeType: String) -> Unit {
    val context = LocalContext.current
    return remember(context) {
        { bytes, fileName, mimeType ->
            runCatching {
                // ⚠ Under cache/documents only — the one directory `file_paths.xml` exposes.
                val dir = File(context.cacheDir, "documents").apply { mkdirs() }
                val file = File(dir, fileName.replace(Regex("[^A-Za-z0-9 ._-]"), "")).apply { writeBytes(bytes) }
                val uri = FileProvider.getUriForFile(context, "${context.packageName}.documents", file)
                val send = Intent(Intent.ACTION_SEND)
                    .setType(mimeType)
                    .putExtra(Intent.EXTRA_STREAM, uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                context.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        }
    }
}
