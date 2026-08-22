package com.effyshopping.driver.mobile.core.platform

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable

/**
 * Android core-permission request via ActivityResult (049 FR-004). Requests camera, fine location, and —
 * on API 33+ — notifications, in one system dialog sequence. Priming never blocks on the outcome:
 * [onDone] fires whether granted or denied (the permission-denied recovery path handles refusals later).
 */
@Composable
actual fun rememberCorePermissionRequester(onDone: () -> Unit): () -> Unit {
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { _ -> onDone() }

    val permissions = buildList {
        add(Manifest.permission.CAMERA)
        add(Manifest.permission.ACCESS_FINE_LOCATION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            add(Manifest.permission.POST_NOTIFICATIONS)
        }
    }.toTypedArray()

    return { launcher.launch(permissions) }
}
