package com.effyshopping.customer.mobile.features.appupdate

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
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
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.effyshopping.customer.mobile.core.presentation.EffyGhostButton
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.customer.mobile.core.presentation.EffySheet
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.customer.mobile.core.presentation.EffyWordmark
import com.effyshopping.customer.mobile.core.presentation.effyMotionFull
import com.effyshopping.customer.mobile.core.theme.EffyRoles
import com.effyshopping.mobile.kit.update.UpdateHero
import com.effyshopping.mobile.kit.update.UpdateHeroColors
import com.effyshopping.mobile.kit.update.updateEnter

/** 121: the words, one set for both platforms (spec "Words"; draft, to be approved). */
internal object AppUpdateWords {
    const val MANDATORY_TITLE = "Time to update Effy"
    const val MANDATORY_TEXT = "This version of Effy has stopped working. Update to the latest version to keep shopping."
    const val UPDATE_NOW = "Update now"
    const val SHEET_TITLE = "A new version of Effy is here"
    const val SHEET_TEXT = "Update for the latest improvements and fixes. It only takes a moment."
    const val LATER = "Not now"
    const val DOWNLOADED = "Update downloaded"
    const val RESTART = "Restart"
    const val AVAILABLE = "Update available"

    fun shopOn(host: String) = "Shop on $host instead"
    fun yourVersion(version: String, build: Int) = "You have version $version ($build)"
}

/** What shows while the answer is awaited (under the launch intro): the page and the wordmark. */
@Composable
internal fun AppUpdateLaunchSurface() {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { EffyWordmark(size = 40.sp) }
}

/** The Effy icon with the update badge and its pulse, in this app's colours and type. */
@Composable
private fun EffyUpdateHero(tileSize: Dp, modifier: Modifier = Modifier) {
    UpdateHero(
        tileSize = tileSize,
        colors = UpdateHeroColors(
            tile = EffyRoles.splashGround,
            tileEdge = MaterialTheme.colorScheme.outlineVariant,
            pulse = MaterialTheme.colorScheme.primary,
            badge = MaterialTheme.colorScheme.primary,
            badgeInk = MaterialTheme.colorScheme.onPrimary,
            page = EffySurface.page,
        ),
        animate = effyMotionFull(),
        modifier = modifier,
    ) {
        // The app icon's "e." - the wordmark's own letter and full stop.
        Text(
            buildAnnotatedString {
                append("e")
                withStyle(SpanStyle(color = EffyRoles.brand)) { append(".") }
            },
            style = MaterialTheme.typography.displayMedium.copy(
                fontSize = (tileSize.value * 0.46f).sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = (-0.05).em,
            ),
            color = EffyRoles.splashInk,
        )
    }
}

/**
 * Below the minimum (FR-010): the whole app. The picture and the words in the middle, the one action pinned at the
 * bottom (one call to action, as a forced update should have), the website as a quiet second way. Nothing leads in.
 */
@Composable
internal fun MandatoryUpdateScreen(
    updateOffered: Boolean,
    busy: Boolean,
    version: String,
    build: Int,
    webSiteHost: String,
    onUpdate: () -> Unit,
    onWebsite: () -> Unit,
) {
    val uri = LocalUriHandler.current
    val animate = effyMotionFull()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.weight(1f))
        EffyUpdateHero(tileSize = 112.dp)
        Spacer(Modifier.height(20.dp))
        Text(
            AppUpdateWords.MANDATORY_TITLE,
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.SemiBold),
            textAlign = TextAlign.Center,
            modifier = Modifier.updateEnter(0, animate),
        )
        Text(
            AppUpdateWords.MANDATORY_TEXT,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.widthIn(max = 340.dp).padding(top = 10.dp).updateEnter(1, animate),
        )
        Text(
            AppUpdateWords.yourVersion(version, build),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 16.dp).updateEnter(2, animate),
        )
        Spacer(Modifier.weight(1.2f))
        Column(
            modifier = Modifier.fillMaxWidth().widthIn(max = 480.dp).padding(bottom = 16.dp).updateEnter(3, animate),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (updateOffered) {
                EffyPrimaryButton(AppUpdateWords.UPDATE_NOW, onClick = onUpdate, loading = busy, modifier = Modifier.fillMaxWidth())
            }
            if (webSiteHost.isNotEmpty()) {
                EffyGhostButton(
                    AppUpdateWords.shopOn(webSiteHost),
                    onClick = {
                        onWebsite()
                        runCatching { uri.openUri("https://$webSiteHost") }
                    },
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}

/**
 * Below recommended (every launch) or latest (once): a sheet over the app (FR-011). The picture, the words, Update now
 * and Not now - the same parts as the full screen, in a sheet. It stays while Update now works (FR-014).
 */
@Composable
internal fun UpdateSheet(updateOffered: Boolean, busy: Boolean, onUpdate: () -> Unit, onLater: () -> Unit) {
    val animate = effyMotionFull()
    EffySheet(title = null, onDismiss = onLater, cancelLabel = null, busy = busy) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(top = 4.dp, bottom = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(Modifier.padding(bottom = 4.dp)) { EffyUpdateHero(tileSize = 76.dp) }
            Text(
                AppUpdateWords.SHEET_TITLE,
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold),
                textAlign = TextAlign.Center,
                modifier = Modifier.updateEnter(0, animate),
            )
            Text(
                AppUpdateWords.SHEET_TEXT,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.widthIn(max = 320.dp).padding(top = 8.dp).updateEnter(1, animate),
            )
            Column(
                modifier = Modifier.fillMaxWidth().padding(top = 24.dp).updateEnter(2, animate),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                if (updateOffered) {
                    EffyPrimaryButton(AppUpdateWords.UPDATE_NOW, onClick = onUpdate, loading = busy, modifier = Modifier.fillMaxWidth())
                }
                EffyGhostButton(AppUpdateWords.LATER, onClick = onLater, enabled = !busy, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
            }
        }
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
