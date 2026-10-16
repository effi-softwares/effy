package com.effyshopping.driver.mobile.features.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.effyshopping.driver.mobile.core.presentation.DriverActionBar
import com.effyshopping.driver.mobile.core.presentation.DriverAlert
import com.effyshopping.driver.mobile.core.presentation.DriverAlertKind
import com.effyshopping.driver.mobile.core.presentation.DriverButton
import com.effyshopping.driver.mobile.core.presentation.DriverIcon
import com.effyshopping.driver.mobile.core.presentation.DriverInlineBar
import com.effyshopping.driver.mobile.core.presentation.DriverSize
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_camera
import com.effyshopping.driver.mobile.resources.lucide_pen_line

/**
 * The camera was refused (canvas `PermissionDenied`). It says what is lost and how to turn it back on,
 * and offers the one proof that needs no camera. ⚠ No "Open Settings" button: this app has no settings
 * launcher for the camera, and a button that does nothing is worse than none — the way is said in words.
 */
@Composable
fun PermissionDeniedScreen(onBack: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        DriverInlineBar("", backLabel = "Drop", onBack = onBack)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Box(Modifier.size(64.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
                DriverIcon(Res.drawable.lucide_camera, size = 28.dp)
            }
            Text("The camera is off for Effy Driver", fontSize = 26.sp, lineHeight = 32.sp, fontWeight = FontWeight.Bold)
            Text(
                "Photo proof and \"left safely\" both need a photo, so they can't be used until the camera is on.",
                style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                listOf("Open Settings on your phone", "Find Effy Driver", "Turn on Camera, then come back here").forEachIndexed { i, step ->
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(28.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
                            Text("${i + 1}", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold))
                        }
                        Text(step, style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
            DriverAlert(
                DriverAlertKind.Info, Res.drawable.lucide_pen_line,
                title = "Customer can sign instead",
                description = "If they're at the door, a signature doesn't need the camera.",
            )
        }
        DriverActionBar {
            DriverButton("Back to the drop", onClick = onBack, modifier = Modifier.fillMaxWidth())
        }
    }
}
