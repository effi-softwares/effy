package com.effyshopping.driver.mobile.core.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.effyshopping.driver.mobile.core.theme.EffyRoles
import com.effyshopping.driver.mobile.design.EffyStorefrontShape

/**
 * A bottom sheet (the canvas's sheets: report a problem, how was it handed over, go off duty, sign out).
 * Every overlay in the driver app is a sheet, never a centred dialog.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DriverSheet(
    title: String?,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    description: String? = null,
    /** A centred icon above a centred title (the confirm sheets: go off duty, sign out). */
    icon: org.jetbrains.compose.resources.DrawableResource? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        sheetMaxWidth = 640.dp,
        shape = EffyStorefrontShape.sheetTop,
        containerColor = MaterialTheme.colorScheme.background,
        scrimColor = EffyRoles.scrim,
        dragHandle = {
            Box(
                Modifier.padding(top = 8.dp, bottom = 4.dp).size(width = 48.dp, height = 5.dp).clip(CircleShape)
                    .background(MaterialTheme.colorScheme.outline),
            )
        },
        contentWindowInsets = { WindowInsets(0, 0, 0, 0) },
        modifier = modifier,
    ) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding()
                .padding(horizontal = 20.dp).padding(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            val centred = icon != null
            if (icon != null) {
                Box(
                    Modifier.fillMaxWidth().padding(top = 12.dp),
                    contentAlignment = androidx.compose.ui.Alignment.Center,
                ) {
                    Box(
                        Modifier.size(56.dp).clip(com.effyshopping.driver.mobile.design.EffyStorefrontShape.banner).background(MaterialTheme.colorScheme.surfaceVariant),
                        contentAlignment = androidx.compose.ui.Alignment.Center,
                    ) { DriverIcon(icon, size = 26.dp) }
                }
            }
            if (title != null) {
                Text(
                    title,
                    fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold,
                    textAlign = if (centred) androidx.compose.ui.text.style.TextAlign.Center else null,
                    modifier = Modifier.fillMaxWidth().padding(top = if (centred) 0.dp else 8.dp).semantics { heading() },
                )
            }
            if (description != null) {
                Text(
                    description, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = if (centred) androidx.compose.ui.text.style.TextAlign.Center else null,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            content()
        }
    }
}
