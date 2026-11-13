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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.effyshopping.customer.mobile.core.presentation.EffyGhostButton
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.customer.mobile.core.presentation.EffySheet
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.customer.mobile.core.presentation.EffyWordmark
import com.effyshopping.customer.mobile.core.presentation.effyMotionFull
import com.effyshopping.customer.mobile.core.theme.EffyRoles
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.effy_app_icon
import com.effyshopping.mobile.kit.update.UpdateHero
import org.jetbrains.compose.resources.painterResource
import com.effyshopping.mobile.kit.update.UpdateHeroColors
import com.effyshopping.mobile.kit.update.updateEnter

/** 121: the words, one set for both platforms (spec "Words"; draft, to be approved). */
internal object AppUpdateWords {
    const val MANDATORY_TITLE = "Time to update Effy"
    const val MANDATORY_TEXT = "We've made some important changes. Please update to the latest version to keep shopping."
    const val UPDATE_NOW = "Update now"
    // Optional: asked at every launch until updated - so its button says it will come back.
    const val OPTIONAL_TITLE = "An important update is ready"
    const val OPTIONAL_TEXT = "This update fixes problems and keeps Effy running smoothly. We recommend updating now."
    const val REMIND_LATER = "Remind me later"
    // Notice: mentioned once - so its button promises nothing.
    const val NOTICE_TITLE = "A new version of Effy is here"
    const val NOTICE_TEXT = "We've made a few improvements and fixes. Update whenever it suits you."
    const val NOT_NOW = "Not now"
    const val DOWNLOADED = "Update downloaded"
    const val RESTART = "Restart"
    const val AVAILABLE = "Update available"

    fun shopOn(host: String) = "Shop on $host instead"
    // The version only: the build number is for support, and Account shows it.
    fun yourVersion(version: String) = "You have version $version"
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
            // A hairline so the black icon keeps its edge on the dark theme; barely there on the light one.
            tileEdge = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.10f),
            pulse = MaterialTheme.colorScheme.primary,
            badge = MaterialTheme.colorScheme.primary,
            badgeInk = MaterialTheme.colorScheme.onPrimary,
            page = EffySurface.page,
        ),
        animate = effyMotionFull(),
        icon = painterResource(Res.drawable.effy_app_icon),
        modifier = modifier,
    )
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
            AppUpdateWords.yourVersion(version),
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
 * and Remind me later (optional, it comes back) or Not now (notice, said once) - the same parts as the full screen. It stays while Update now works (FR-014).
 */
@Composable
internal fun UpdateSheet(notice: Boolean, updateOffered: Boolean, busy: Boolean, onUpdate: () -> Unit, onLater: () -> Unit) {
    val animate = effyMotionFull()
    EffySheet(title = null, onDismiss = onLater, cancelLabel = null, busy = busy) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(top = 4.dp, bottom = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(Modifier.padding(bottom = 4.dp)) { EffyUpdateHero(tileSize = 76.dp) }
            Text(
                if (notice) AppUpdateWords.NOTICE_TITLE else AppUpdateWords.OPTIONAL_TITLE,
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold),
                textAlign = TextAlign.Center,
                modifier = Modifier.updateEnter(0, animate),
            )
            Text(
                if (notice) AppUpdateWords.NOTICE_TEXT else AppUpdateWords.OPTIONAL_TEXT,
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
                EffyGhostButton(if (notice) AppUpdateWords.NOT_NOW else AppUpdateWords.REMIND_LATER, onClick = onLater, enabled = !busy, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
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
