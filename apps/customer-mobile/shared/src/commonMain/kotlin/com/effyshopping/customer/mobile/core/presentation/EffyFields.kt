package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.core.theme.EffyRoles
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.lucide_circle_alert
import com.effyshopping.customer.mobile.resources.lucide_eye
import com.effyshopping.customer.mobile.resources.lucide_eye_off
import com.effyshopping.customer.mobile.resources.lucide_search
import com.effyshopping.customer.mobile.resources.lucide_x
import com.effyshopping.mobile.design.EffySpacing
import org.jetbrains.compose.resources.painterResource

/** The search field's shape — fully rounded (a pill), unlike the 6dp form fields. */
private val SearchFieldShape = androidx.compose.foundation.shape.RoundedCornerShape(percent = 50)

/**
 * A labelled field — a plain label above a bordered box (the storefront's form control).
 *
 * 48dp, 16sp text (so iOS never zooms), 1dp hairline that becomes a 2dp blue ring on focus. The
 * storefront's border is a deliberately light hairline (the border exception), so every field must
 * carry a visible label and the focus ring (constitution v3.3.0). An error is black text with an
 * alert icon beneath, never a red border.
 *
 * @param label nullable: inside a sheet whose title already names the field, pass null.
 */
@Composable
fun EffyField(
    label: String?,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    error: String? = null,
    singleLine: Boolean = true,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    trailing: (@Composable () -> Unit)? = null,
    enabled: Boolean = true,
) {
    val focus = remember { MutableInteractionSource() }
    val focused by focus.collectIsFocusedAsState()
    val borderWidth = if (focused || error != null) 2.dp else 1.dp
    val borderColor = when {
        focused -> MaterialTheme.colorScheme.primary
        error != null -> MaterialTheme.colorScheme.onSurface
        else -> MaterialTheme.colorScheme.outline
    }

    Column(modifier = modifier.fillMaxWidth()) {
        if (label != null) {
            Text(
                label,
                style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.padding(bottom = EffySpacing.s),
            )
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = EffySize.field)
                .clip(EffyStorefrontShape.control)
                .border(borderWidth, borderColor, EffyStorefrontShape.control)
                .padding(start = EffySpacing.md, end = if (trailing != null) 0.dp else EffySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(modifier = Modifier.weight(1f).padding(vertical = EffySpacing.md)) {
                if (value.isEmpty() && placeholder != null) {
                    Text(placeholder, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                BasicTextField(
                    value = value,
                    onValueChange = onValueChange,
                    enabled = enabled,
                    singleLine = singleLine,
                    keyboardOptions = keyboardOptions,
                    keyboardActions = keyboardActions,
                    visualTransformation = visualTransformation,
                    interactionSource = focus,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface),
                    cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            if (trailing != null) trailing()
        }
        if (error != null) EffyInlineError(error, modifier = Modifier.padding(top = EffySpacing.s))
    }
}

/**
 * A password input with a reveal toggle — the one password field in this app. The toggle is an
 * accessibility control (WCAG 2.2 SC 3.3.8); hidden by default and never restored after backgrounding.
 */
@Composable
fun EffyPasswordField(
    label: String?,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    error: String? = null,
) {
    var revealed by remember { mutableStateOf(false) }
    EffyField(
        label = label,
        value = value,
        onValueChange = onValueChange,
        modifier = modifier,
        placeholder = placeholder,
        error = error,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        visualTransformation = if (revealed) VisualTransformation.None else PasswordVisualTransformation(),
        trailing = {
            EffyIconButton(
                icon = if (revealed) Res.drawable.lucide_eye_off else Res.drawable.lucide_eye,
                contentDescription = if (revealed) "Hide password" else "Show password",
                onClick = { revealed = !revealed },
            )
        },
    )
}

/**
 * The search field — light-blue fill, search glyph, clear button, 48dp, 16sp (Main and Search boards).
 *
 * Two modes: a live field ([onValueChange] set), or an entry that only navigates ([onEntryClick] set,
 * as on Home, where tapping it opens the Search tab with the keyboard up).
 */
@Composable
fun EffySearchField(
    value: String,
    placeholder: String,
    modifier: Modifier = Modifier,
    onValueChange: ((String) -> Unit)? = null,
    onSearch: ((String) -> Unit)? = null,
    onEntryClick: (() -> Unit)? = null,
    focusRequester: FocusRequester? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = EffySize.field)
            // Operator direction: an outlined, fully rounded search field on the white page
            // no tinted fill.
            .clip(SearchFieldShape)
            .background(MaterialTheme.colorScheme.background)
            .border(1.dp, MaterialTheme.colorScheme.outline, SearchFieldShape)
            .then(
                if (onEntryClick != null) Modifier.clickable(role = Role.Button, onClickLabel = placeholder, onClick = onEntryClick)
                else Modifier,
            )
            .padding(start = EffySpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
    ) {
        Icon(
            painterResource(Res.drawable.lucide_search),
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(20.dp),
        )
        Box(modifier = Modifier.weight(1f).padding(vertical = EffySpacing.md)) {
            if (value.isEmpty()) {
                Text(placeholder, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            }
            if (onValueChange != null) {
                BasicTextField(
                    value = value,
                    onValueChange = onValueChange,
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { onSearch?.invoke(value) }),
                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface),
                    cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                    modifier = Modifier
                        .fillMaxWidth()
                        .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier),
                )
            }
        }
        if (onValueChange != null && value.isNotEmpty()) {
            EffyIconButton(Res.drawable.lucide_x, contentDescription = "Clear search", onClick = { onValueChange("") }, iconSize = 18.dp)
        } else {
            Box(Modifier.size(EffySpacing.s))
        }
    }
}

/** An error line: alert icon + black text (the storefront has no red). */
@Composable
fun EffyInlineError(text: String, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            painterResource(Res.drawable.lucide_circle_alert),
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(top = 2.dp).size(16.dp),
        )
        Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
    }
}

/**
 * The live search field with caret and selection control (the Search screen keeps a kept query
 * selected on arrival, so typing replaces it in one action — 028 FR-012a).
 */
@Composable
fun EffySearchField(
    value: androidx.compose.ui.text.input.TextFieldValue,
    onValueChange: (androidx.compose.ui.text.input.TextFieldValue) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    onSearch: () -> Unit = {},
    focusRequester: FocusRequester? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = EffySize.field)
            // Operator direction: an outlined, fully rounded search field on the white page
            // no tinted fill.
            .clip(SearchFieldShape)
            .background(MaterialTheme.colorScheme.background)
            .border(1.dp, MaterialTheme.colorScheme.outline, SearchFieldShape)
            .padding(start = EffySpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
    ) {
        Icon(painterResource(Res.drawable.lucide_search), contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
        Box(modifier = Modifier.weight(1f).padding(vertical = EffySpacing.md)) {
            if (value.text.isEmpty()) {
                Text(placeholder, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            }
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { onSearch() }),
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface),
                cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                modifier = Modifier.fillMaxWidth().then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier),
            )
        }
        if (value.text.isNotEmpty()) {
            EffyIconButton(Res.drawable.lucide_x, contentDescription = "Clear search", onClick = { onValueChange(androidx.compose.ui.text.input.TextFieldValue("")) }, iconSize = 18.dp)
        } else {
            Box(Modifier.size(EffySpacing.s))
        }
    }
}
