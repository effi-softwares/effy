package com.effyshopping.driver.mobile.features.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
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
import com.effyshopping.driver.mobile.core.platform.rememberCorePermissionRequester
import com.effyshopping.driver.mobile.core.presentation.DriverButton
import com.effyshopping.driver.mobile.core.presentation.DriverButtonStyle
import com.effyshopping.driver.mobile.core.presentation.DriverIcon
import com.effyshopping.driver.mobile.core.theme.EffyRoles
import com.effyshopping.driver.mobile.design.EffyStorefrontShape
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_bell
import com.effyshopping.driver.mobile.resources.lucide_camera
import org.jetbrains.compose.resources.DrawableResource

/**
 * The two permissions, explained before the phone asks (canvas `Permissions`). Asked once; "Not now"
 * goes straight in — the app never blocks on a grant.
 */
@Composable
fun PermissionPrimingScreen(firstName: String?, onContinue: () -> Unit) {
    val request = rememberCorePermissionRequester(onDone = onContinue)
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 24.dp)) {
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(top = 32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(firstName?.let { "Welcome, $it" } ?: "Welcome", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("Two things the app needs", fontSize = 28.sp, lineHeight = 34.sp, fontWeight = FontWeight.Bold)
            Text("Your phone will ask next. Here's what each one is for.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Reason(Res.drawable.lucide_bell, "Notifications", "So you hear the moment a run is assigned or changes — even with the app closed.")
            Reason(Res.drawable.lucide_camera, "Camera", "To photograph proof of delivery at the door. Photos are only taken when you press the shutter.")
        }
        Column(Modifier.padding(vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            DriverButton("Continue", onClick = request, modifier = Modifier.fillMaxWidth())
            DriverButton("Not now", onClick = onContinue, style = DriverButtonStyle.Ghost, tall = false, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun Reason(icon: DrawableResource, title: String, body: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(Modifier.size(44.dp).clip(EffyStorefrontShape.card).background(EffyRoles.primaryMuted), contentAlignment = Alignment.Center) {
            DriverIcon(icon, size = 22.dp, tint = MaterialTheme.colorScheme.primary)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold))
            Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
