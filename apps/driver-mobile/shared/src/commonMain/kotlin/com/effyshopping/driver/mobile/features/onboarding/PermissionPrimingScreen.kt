package com.effyshopping.driver.mobile.features.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.platform.rememberCorePermissionRequester

/**
 * Permission priming (049 US1, FR-004). Explains — in plain words, BEFORE the OS prompts — why the app
 * needs location, notifications and camera. "Allow access" triggers the system dialogs; "Not now" skips
 * (a driver can grant later from settings, and the permission-denied recovery path guides them). Shown
 * once after first sign-in.
 */
@Composable
fun PermissionPrimingScreen(onContinue: () -> Unit) {
    val request = rememberCorePermissionRequester(onDone = onContinue)

    Column(
        modifier = Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(24.dp),
    ) {
        Spacer(Modifier.height(8.dp))
        Text("Before you start", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(6.dp))
        Text(
            "Effy needs a few permissions to help you deliver. We'll only ask for what the job needs.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(24.dp))

        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Rationale("Location", "To match you with nearby work and navigate to your stops.")
            Rationale("Notifications", "To let you know the moment new work is assigned.")
            Rationale("Camera", "To capture proof of delivery when you drop off an order.")
        }

        Spacer(Modifier.weight(1f))

        Button(
            onClick = { request() },
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth().height(56.dp),
        ) { Text("Allow access", style = MaterialTheme.typography.titleMedium) }
        Spacer(Modifier.height(6.dp))
        TextButton(onClick = onContinue, modifier = Modifier.fillMaxWidth()) { Text("Not now") }
    }
}

@Composable
private fun Rationale(title: String, body: String) {
    Row(verticalAlignment = Alignment.Top) {
        Surface(color = MaterialTheme.colorScheme.primary, shape = CircleShape, modifier = Modifier.size(10.dp).padding(top = 6.dp)) {}
        Spacer(Modifier.size(14.dp))
        Column {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Start)
        }
    }
}
