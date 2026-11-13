package com.effyshopping.customer.mobile.features.appupdate

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.effyshopping.customer.mobile.core.presentation.EffyGhostButton
import com.effyshopping.customer.mobile.core.presentation.EffyIconChip
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.customer.mobile.core.presentation.EffySheet
import com.effyshopping.customer.mobile.core.presentation.EffyWordmark
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.lucide_smartphone

/** 121: the words, one set for both platforms (spec "Words"; draft, to be approved). */
internal object AppUpdateWords {
    const val MANDATORY_TITLE = "Update Effy to keep going"
    const val MANDATORY_TEXT = "This version of Effy no longer works. Update to the latest version to keep shopping."
    const val UPDATE_NOW = "Update now"
    const val SHEET_TITLE = "A new version of Effy is ready"
    const val SHEET_TEXT = "Update for the latest improvements."
    const val LATER = "Later"
    const val DOWNLOADED = "Update downloaded"
    const val RESTART = "Restart"
    const val AVAILABLE = "Update available"

    fun shopOn(host: String) = "Shop on $host"
}

/** What shows behind the sheet before Home, and while the answer is awaited: the launch screen's mark. */
@Composable
internal fun AppUpdateLaunchSurface() {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { EffyWordmark(size = 40.sp) }
}

/**
 * Below the minimum (FR-010): the whole app. Update now is the only way on; [webSiteHost], when set, offers the website
 * instead. Nothing here leads into the app.
 */
@Composable
internal fun MandatoryUpdateScreen(
    updateOffered: Boolean,
    webSiteHost: String,
    onUpdate: () -> Unit,
    onWebsite: () -> Unit,
) {
    val uri = LocalUriHandler.current
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        EffyIconChip(Res.drawable.lucide_smartphone)
        Text(
            AppUpdateWords.MANDATORY_TITLE,
            style = MaterialTheme.typography.titleLarge,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 16.dp),
        )
        Text(
            AppUpdateWords.MANDATORY_TEXT,
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp),
        )
        if (updateOffered) {
            EffyPrimaryButton(AppUpdateWords.UPDATE_NOW, onClick = onUpdate, modifier = Modifier.fillMaxWidth().padding(top = 24.dp))
        }
        if (webSiteHost.isNotEmpty()) {
            EffyGhostButton(
                AppUpdateWords.shopOn(webSiteHost),
                onClick = {
                    onWebsite()
                    runCatching { uri.openUri("https://$webSiteHost") }
                },
                modifier = Modifier.padding(top = 8.dp),
            )
        }
    }
}

/** Below recommended (every launch) or latest (once): the sheet before Home (FR-011). Dismissing it is Later. */
@Composable
internal fun UpdateSheet(updateOffered: Boolean, onUpdate: () -> Unit, onLater: () -> Unit) {
    EffySheet(
        title = AppUpdateWords.SHEET_TITLE,
        onDismiss = onLater,
        primaryLabel = if (updateOffered) AppUpdateWords.UPDATE_NOW else null,
        onPrimary = if (updateOffered) onUpdate else null,
        cancelLabel = AppUpdateWords.LATER,
    ) {
        Text(AppUpdateWords.SHEET_TEXT, style = MaterialTheme.typography.bodyMedium)
    }
}

/** "Update downloaded · Restart", on whatever screen is showing, once Play's background download is ready (US2). */
@Composable
internal fun UpdateDownloadedBar(host: SnackbarHostState, onRestart: () -> Unit) {
    LaunchedEffect(Unit) {
        val result = host.showSnackbar(
            message = AppUpdateWords.DOWNLOADED,
            actionLabel = AppUpdateWords.RESTART,
            duration = SnackbarDuration.Indefinite,
        )
        if (result == SnackbarResult.ActionPerformed) onRestart()
    }
}
