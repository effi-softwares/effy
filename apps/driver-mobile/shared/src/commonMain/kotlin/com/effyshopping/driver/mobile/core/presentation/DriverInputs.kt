package com.effyshopping.driver.mobile.core.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.effyshopping.driver.mobile.design.EffyStorefrontShape
import org.jetbrains.compose.resources.DrawableResource

/**
 * A labelled text field (the canvas's `ui-input` / `ui-textarea`). A problem is said under it in words
 * with a heavier border - never red.
 */
@Composable
fun DriverTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    problem: String? = null,
    hint: String? = null,
    lines: Int = 1,
    enabled: Boolean = true,
    keyboardOptions: KeyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
) {
    val scheme = MaterialTheme.colorScheme
    val shape = EffyStorefrontShape.control
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium))
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            enabled = enabled,
            singleLine = lines == 1,
            minLines = lines,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = scheme.onSurface),
            cursorBrush = SolidColor(scheme.primary),
            keyboardOptions = keyboardOptions,
            modifier = Modifier
                .fillMaxWidth()
                .semantics {
                    contentDescription = label
                    if (problem != null) error(problem)
                },
            decorationBox = { inner ->
                Box(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 52.dp)
                        .clip(shape)
                        .background(scheme.background)
                        .border(if (problem != null) 2.dp else 1.dp, if (problem != null) scheme.onSurface else scheme.outline, shape)
                        .padding(horizontal = 14.dp, vertical = 14.dp),
                ) {
                    if (value.isEmpty() && placeholder != null) {
                        Text(placeholder, style = MaterialTheme.typography.bodyLarge, color = scheme.onSurfaceVariant)
                    }
                    inner()
                }
            },
        )
        if (problem != null) {
            Text(problem, style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium), color = scheme.onSurface)
        } else if (hint != null) {
            Text(hint, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
        }
    }
}

/**
 * One choice in a radio list (reasons, how it was handed over, where it was left). Selected is a blue
 * border and a filled ring; an optional icon and a description sit beside the title.
 */
@Composable
fun DriverChoice(
    title: String,
    selected: Boolean,
    onSelect: () -> Unit,
    modifier: Modifier = Modifier,
    body: String? = null,
    icon: DrawableResource? = null,
    tag: String? = null,
    /** The icon in a filled square tile (how-was-it-handed-over) or plain beside the text (report a problem). */
    iconTile: Boolean = true,
) {
    val scheme = MaterialTheme.colorScheme
    val shape = EffyStorefrontShape.card
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .clip(shape)
            .border(if (selected) 2.dp else 1.dp, if (selected) scheme.primary else scheme.outlineVariant, shape)
            .selectable(selected = selected, role = Role.RadioButton, onClick = onSelect)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon == null) {
            // The radio ring leads when there is no icon (the redesign's "Can't deliver" reasons).
            Box(
                Modifier.size(22.dp).clip(CircleShape).border(2.dp, if (selected) scheme.primary else scheme.outline, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                if (selected) Box(Modifier.size(10.dp).clip(CircleShape).background(scheme.primary))
            }
        } else if (iconTile) {
            Box(
                Modifier.size(44.dp).clip(EffyStorefrontShape.card).background(if (selected) scheme.primary else scheme.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                DriverIcon(icon, size = 20.dp, tint = if (selected) scheme.onPrimary else scheme.onSurface)
            }
        } else {
            DriverIcon(icon, size = 22.dp, tint = scheme.onSurface)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(title, fontSize = 18.sp, fontWeight = FontWeight.Medium)
                if (tag != null) {
                    Text(
                        tag,
                        style = MaterialTheme.typography.labelSmall,
                        color = scheme.primary,
                        modifier = Modifier.clip(EffyStorefrontShape.control).background(com.effyshopping.driver.mobile.core.theme.EffyRoles.primaryMuted).padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
            }
            if (body != null) Text(body, style = MaterialTheme.typography.bodyMedium, color = scheme.onSurfaceVariant)
        }
    }
}

/** A thin progress bar; [done] colours it green (finished work), otherwise blue. */
@Composable
fun DriverProgress(fraction: Float, modifier: Modifier = Modifier, done: Boolean = false) {
    val f = fraction.coerceIn(0f, 1f)
    // The track is the bar's own tint: blue-muted for work under way, green-muted for done.
    val track = if (done) com.effyshopping.driver.mobile.core.theme.EffyRoles.brandMuted else com.effyshopping.driver.mobile.core.theme.EffyRoles.primaryMuted
    Box(modifier.fillMaxWidth().heightIn(min = 6.dp).clip(CircleShape).background(track)) {
        Box(
            Modifier.fillMaxWidth(f).heightIn(min = 6.dp).clip(CircleShape)
                .background(if (done) com.effyshopping.driver.mobile.core.theme.EffyRoles.brand else MaterialTheme.colorScheme.primary),
        )
    }
}
