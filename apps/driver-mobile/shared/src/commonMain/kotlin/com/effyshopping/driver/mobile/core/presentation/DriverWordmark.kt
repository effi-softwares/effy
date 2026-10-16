package com.effyshopping.driver.mobile.core.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** "effy." with the blue dot, and "Driver" beside it (the canvas's Splash and sign-in). */
@Composable
fun DriverWordmark(modifier: Modifier = Modifier, size: TextUnit = 28.sp, showDriver: Boolean = true) {
    val scheme = MaterialTheme.colorScheme
    Row(
        modifier.semantics(mergeDescendants = true) { contentDescription = "Effy Driver" },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        Text(
            buildAnnotatedString {
                append("effy")
                withStyle(SpanStyle(color = scheme.primary)) { append(".") }
            },
            fontSize = size,
            fontWeight = FontWeight.Bold,
            letterSpacing = (-1).sp,
        )
        if (showDriver) {
            Text("Driver", fontSize = size * 0.6f, fontWeight = FontWeight.Medium, color = scheme.onSurfaceVariant)
        }
    }
}
