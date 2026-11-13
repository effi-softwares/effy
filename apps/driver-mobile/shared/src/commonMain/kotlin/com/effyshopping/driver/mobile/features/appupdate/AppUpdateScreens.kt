package com.effyshopping.driver.mobile.features.appupdate

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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.effyshopping.driver.mobile.core.presentation.DriverButton
import com.effyshopping.driver.mobile.core.presentation.DriverButtonStyle
import com.effyshopping.driver.mobile.core.presentation.DriverSheet
import com.effyshopping.driver.mobile.core.presentation.DriverWordmark
import com.effyshopping.driver.mobile.core.presentation.LocalReducedMotion
import com.effyshopping.driver.mobile.core.theme.EffyRoles
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_phone
import com.effyshopping.mobile.kit.update.UpdateHero
import com.effyshopping.mobile.kit.update.UpdateHeroColors
import com.effyshopping.mobile.kit.update.updateEnter

/** 121: the words, one set for both platforms (spec "Words"; draft, to be approved). */
internal object AppUpdateWords {
    const val MANDATORY_TITLE = "Time to update Effy Driver"
    const val MANDATORY_TEXT = "This version has stopped working. Update to the latest version to carry on with your work."
    const val UPDATE_NOW = "Update now"
    const val CALL_DISPATCH = "Call dispatch"
    const val SHEET_TITLE = "A new version of Effy Driver is here"
    const val SHEET_TEXT = "Update for the latest improvements and fixes. It only takes a moment."
    const val LATER = "Not now"
    const val DOWNLOADED = "Update downloaded"
    const val RESTART = "Restart"
    const val AVAILABLE = "Update available"

    fun yourVersion(version: String, build: Int) = "You have version $version ($build)"
}

/** What shows while the answer is awaited (under the launch intro): the page and the wordmark. */
@Composable
internal fun AppUpdateLaunchSurface() {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { DriverWordmark() }
}

/** The Effy icon with the update badge and its pulse, in this app's colours and type. */
@Composable
private fun DriverUpdateHero(tileSize: Dp, modifier: Modifier = Modifier) {
    UpdateHero(
        tileSize = tileSize,
        colors = UpdateHeroColors(
            tile = EffyRoles.splashGround,
            tileEdge = MaterialTheme.colorScheme.outlineVariant,
            pulse = MaterialTheme.colorScheme.primary,
            badge = MaterialTheme.colorScheme.primary,
            badgeInk = MaterialTheme.colorScheme.onPrimary,
            page = MaterialTheme.colorScheme.background,
        ),
        animate = !LocalReducedMotion.current,
        modifier = modifier,
    ) {
        // The driver app icon's "e." - the splash's letter and its blue full stop.
        Text(
            buildAnnotatedString {
                append("e")
                withStyle(SpanStyle(color = EffyRoles.splashDot)) { append(".") }
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
 * bottom, dispatch as a quiet second way. Work recorded without signal keeps being sent behind it (App.kt).
 */
@Composable
internal fun MandatoryUpdateScreen(
    updateOffered: Boolean,
    busy: Boolean,
    version: String,
    build: Int,
    dispatchPhone: String?,
    onUpdate: () -> Unit,
    onCallDispatch: (String) -> Unit,
) {
    val animate = !LocalReducedMotion.current
    Column(
        modifier = Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.weight(1f))
        DriverUpdateHero(tileSize = 112.dp)
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
                DriverButton(AppUpdateWords.UPDATE_NOW, onClick = onUpdate, loading = busy, modifier = Modifier.fillMaxWidth())
            }
            if (dispatchPhone != null) {
                DriverButton(
                    AppUpdateWords.CALL_DISPATCH,
                    onClick = { onCallDispatch(dispatchPhone) },
                    style = DriverButtonStyle.Ghost,
                    icon = Res.drawable.lucide_phone,
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
            }
        }
    }
}

/**
 * Below recommended (every launch) or latest (once): a sheet over the app (FR-011). The same parts as the full screen,
 * in a sheet. It stays while Update now works (FR-014).
 */
@Composable
internal fun UpdateSheet(updateOffered: Boolean, busy: Boolean, onUpdate: () -> Unit, onLater: () -> Unit) {
    val animate = !LocalReducedMotion.current
    DriverSheet(title = null, onDismiss = { if (!busy) onLater() }) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(Modifier.padding(bottom = 4.dp)) { DriverUpdateHero(tileSize = 76.dp) }
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
                    DriverButton(AppUpdateWords.UPDATE_NOW, onClick = onUpdate, loading = busy, modifier = Modifier.fillMaxWidth())
                }
                DriverButton(
                    AppUpdateWords.LATER,
                    onClick = onLater,
                    style = DriverButtonStyle.Ghost,
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
            }
        }
    }
}
