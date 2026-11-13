package com.effyshopping.driver.mobile.features.appupdate

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.presentation.DriverButton
import com.effyshopping.driver.mobile.core.presentation.DriverButtonStyle
import com.effyshopping.driver.mobile.core.presentation.DriverSheet
import com.effyshopping.driver.mobile.core.presentation.DriverWordmark
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_phone
import com.effyshopping.driver.mobile.resources.lucide_smartphone

/** 121: the words, one set for both platforms (spec "Words"; draft, to be approved). */
internal object AppUpdateWords {
    const val MANDATORY_TITLE = "Update Effy Driver to keep going"
    const val MANDATORY_TEXT = "This version no longer works. Update to the latest version to carry on with your work."
    const val UPDATE_NOW = "Update now"
    const val CALL_DISPATCH = "Call dispatch"
    const val SHEET_TITLE = "A new version of Effy Driver is ready"
    const val SHEET_TEXT = "Update for the latest improvements."
    const val LATER = "Later"
    const val DOWNLOADED = "Update downloaded"
    const val RESTART = "Restart"
    const val AVAILABLE = "Update available"
}

/** What shows behind the sheet before the app, and while the answer is awaited: the launch screen's mark. */
@Composable
internal fun AppUpdateLaunchSurface() {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { DriverWordmark() }
}

/**
 * Below the minimum (FR-010): the whole app. Update now is the only way on; [dispatchPhone], when set, offers a call to
 * dispatch. Work recorded without signal keeps being sent behind this screen (App.kt's root effects).
 */
@Composable
internal fun MandatoryUpdateScreen(
    updateOffered: Boolean,
    dispatchPhone: String?,
    onUpdate: () -> Unit,
    onCallDispatch: (String) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        androidx.compose.material3.Icon(
            org.jetbrains.compose.resources.painterResource(Res.drawable.lucide_smartphone),
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(bottom = 16.dp),
        )
        Text(AppUpdateWords.MANDATORY_TITLE, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
        Text(
            AppUpdateWords.MANDATORY_TEXT,
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp),
        )
        if (updateOffered) {
            DriverButton(AppUpdateWords.UPDATE_NOW, onClick = onUpdate, modifier = Modifier.fillMaxWidth().padding(top = 24.dp))
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

/** Below recommended (every launch) or latest (once): the sheet before the app (FR-011). Dismissing it is Later. */
@Composable
internal fun UpdateSheet(updateOffered: Boolean, onUpdate: () -> Unit, onLater: () -> Unit) {
    DriverSheet(title = AppUpdateWords.SHEET_TITLE, onDismiss = onLater, description = AppUpdateWords.SHEET_TEXT) {
        if (updateOffered) {
            DriverButton(AppUpdateWords.UPDATE_NOW, onClick = onUpdate, modifier = Modifier.fillMaxWidth())
        }
        DriverButton(
            AppUpdateWords.LATER,
            onClick = onLater,
            style = DriverButtonStyle.Ghost,
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        )
    }
}
