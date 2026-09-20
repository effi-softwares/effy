package com.effyshopping.driver.mobile.features.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.ui.draw.clip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
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
        // \u26a0 The design's three-step progress indicator. It is not decoration: it tells a driver
        // the OS is about to ask them three times, which is the difference between "one more tap"
        // and "why does this app keep interrupting me" \u2014 and a driver who feels interrogated
        // declines.
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            repeat(3) { index ->
                Box(
                    Modifier
                        .weight(1f)
                        .height(3.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(
                            if (index == 0) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.surfaceVariant
                            },
                        ),
                )
            }
        }
        Spacer(Modifier.height(30.dp))
        Text(
            "Three things Effy needs",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(10.dp))
        Text(
            "Your phone will ask next. Here's what each one is for.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(24.dp))

        Column {
            Rationale("Location", "To match you with nearby work and navigate to your stops.")
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Rationale("Notifications", "To let you know the moment new work is assigned.")
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Rationale("Camera", "To capture proof of delivery when you drop off an order.")
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
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
    Row(Modifier.padding(vertical = 19.dp), verticalAlignment = Alignment.Top) {
        // The design's bordered glyph tile. The letter is a stand-in until the in-screen icon set
        // lands with the phases that consume it (060 T018, resequenced).
        Surface(
            shape = RoundedCornerShape(11.dp),
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.5.dp, MaterialTheme.colorScheme.onSurface),
            modifier = Modifier.size(40.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(
                    title.take(1),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
        Spacer(Modifier.size(15.dp))
        Column {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Start)
        }
    }
}
