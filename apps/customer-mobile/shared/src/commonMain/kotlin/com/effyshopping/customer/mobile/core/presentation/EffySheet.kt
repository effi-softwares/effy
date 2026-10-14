package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.core.theme.EffyRoles
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import com.effyshopping.mobile.design.EffySpacing
import org.jetbrains.compose.resources.DrawableResource

/**
 * THE ONLY OVERLAY IN THE APP — a bottom sheet (087 FR-013; operator direction: "no dialog modals,
 * bottom sheets for everything"). Every choice, confirmation, picker and short form is one of these.
 *
 * - A 48×5 grab handle, 16dp top corners, the storefront scrim (Filters / AddToList / Security boards).
 * - The CONTENT scrolls; the ACTIONS ARE PINNED at the bottom, above the home indicator AND above the
 *   keyboard (FR-014) — a long form never pushes its Save off-screen.
 * - It closes by dragging down, tapping outside, or the cancel action — except while [busy].
 * - ⚠ A [dirty] sheet never discards silently: dragging, tapping outside or cancelling turns the
 *   sheet's own page into "Discard your changes?" with two pinned buttons. It is the same sheet, not a
 *   dialog on top of it (there are no dialogs).
 *
 * ⚠ The drag is intercepted by `confirmValueChange`, a KEY of the sheet state's `rememberSaveable`:
 * the lambda must be one stable instance reading state at call time, or the sheet dips and springs
 * back on the first keystroke (the 034 Heisenbug). Keep it in `remember {}` with no keys.
 *
 * @param footer replaces the default primary + cancel pair when a sheet needs its own actions.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EffySheet(
    title: String?,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    dirty: Boolean = false,
    primaryLabel: String? = null,
    onPrimary: (() -> Unit)? = null,
    primaryEnabled: Boolean = true,
    primaryLoading: Boolean = false,
    cancelLabel: String? = "Cancel",
    discardTitle: String = "Discard your changes?",
    discardBody: String = "What you typed here will not be saved.",
    fullHeight: Boolean = false,
    busy: Boolean = false,
    footer: (@Composable ColumnScope.() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val confirmingDiscardState = remember { mutableStateOf(false) }
    var confirmingDiscard by confirmingDiscardState
    val dirtyState = rememberUpdatedState(dirty)
    val busyState = rememberUpdatedState(busy)
    val confirmValueChange = remember {
        { target: SheetValue ->
            when {
                target != SheetValue.Hidden -> true
                busyState.value -> false
                dirtyState.value -> { confirmingDiscardState.value = true; false }
                else -> true
            }
        }
    }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true, confirmValueChange = confirmValueChange)
    val requestClose = { if (busy) Unit else if (dirty) confirmingDiscard = true else onDismiss() }

    ModalBottomSheet(
        onDismissRequest = requestClose,
        sheetState = sheetState,
        sheetMaxWidth = 640.dp,
        shape = EffyStorefrontShape.sheetTop,
        containerColor = MaterialTheme.colorScheme.background,
        scrimColor = EffyRoles.scrim,
        dragHandle = { EffySheetHandle() },
        contentWindowInsets = { WindowInsets(0, 0, 0, 0) },
        modifier = modifier,
    ) {
        val duration = effyDuration(EffyStorefrontMotion.StandardMillis)
        AnimatedContent(
            targetState = confirmingDiscard,
            transitionSpec = { fadeIn(tween(duration)) togetherWith fadeOut(tween(duration)) },
            label = "sheetDiscard",
        ) { discarding ->
            if (discarding) {
                EffySheetBody(
                    title = discardTitle,
                    centred = true,
                    fullHeight = false,
                    content = {
                        Text(
                            discardBody,
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    },
                    footer = {
                        EffyPrimaryButton("Discard", onClick = { confirmingDiscard = false; onDismiss() }, destructive = true)
                        EffyGhostButton("Keep editing", onClick = { confirmingDiscard = false }, modifier = Modifier.fillMaxWidth())
                    },
                )
            } else {
                EffySheetBody(
                    title = title,
                    centred = false,
                    fullHeight = fullHeight,
                    content = content,
                    footer = footer ?: if (primaryLabel != null && onPrimary != null || cancelLabel != null) {
                        {
                            if (primaryLabel != null && onPrimary != null) {
                                EffyPrimaryButton(primaryLabel, onClick = onPrimary, enabled = primaryEnabled, loading = primaryLoading)
                            }
                            if (cancelLabel != null) {
                                EffyGhostButton(cancelLabel, onClick = requestClose, enabled = !busy, modifier = Modifier.fillMaxWidth())
                            }
                        }
                    } else {
                        null
                    },
                )
            }
        }
    }
}

/** The sheet's grab handle: 48×5, zinc, centred. */
@Composable
fun EffySheetHandle() {
    Box(
        modifier = Modifier
            .padding(top = EffySpacing.s, bottom = EffySpacing.xs)
            .size(width = 48.dp, height = 5.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.outline),
    )
}

/** Title · scrolling content · pinned footer — the layout every sheet shares. */
@Composable
private fun EffySheetBody(
    title: String?,
    centred: Boolean,
    fullHeight: Boolean,
    content: @Composable ColumnScope.() -> Unit,
    footer: (@Composable ColumnScope.() -> Unit)?,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (fullHeight) Modifier.fillMaxHeight(0.92f) else Modifier),
    ) {
        if (title != null) {
            Text(
                title,
                style = MaterialTheme.typography.titleLarge,
                textAlign = if (centred) TextAlign.Center else TextAlign.Start,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = EffySpacing.xl, vertical = EffySpacing.md)
                    .semantics { heading() },
            )
        }
        Column(
            modifier = Modifier
                .weight(1f, fill = fullHeight)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = EffySpacing.xl)
                .padding(bottom = EffySpacing.md),
            verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
            horizontalAlignment = if (centred) Alignment.CenterHorizontally else Alignment.Start,
            content = content,
        )
        if (footer != null) {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .imePadding()
                    .padding(horizontal = EffySpacing.xl)
                    .padding(top = EffySpacing.md, bottom = EffySpacing.md),
                verticalArrangement = Arrangement.spacedBy(EffySpacing.s),
                content = footer,
            )
        } else {
            Box(Modifier.navigationBarsPadding().imePadding())
        }
    }
}

/**
 * A CONFIRMATION — the sheet that replaces every "Are you sure?" dialog (Security board):
 * an icon in a zinc circle, a 20sp title, one sentence, then the pinned confirm (black when it
 * destroys something) and a quiet way out.
 */
@Composable
fun EffyConfirmSheet(
    title: String,
    body: String,
    confirmLabel: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    icon: DrawableResource? = null,
    destructive: Boolean = false,
    cancelLabel: String = "Cancel",
    busy: Boolean = false,
    error: String? = null,
) {
    EffySheet(
        title = null,
        onDismiss = onDismiss,
        modifier = modifier,
        busy = busy,
        footer = {
            EffyPrimaryButton(confirmLabel, onClick = onConfirm, destructive = destructive, loading = busy)
            EffyGhostButton(cancelLabel, onClick = onDismiss, enabled = !busy, modifier = Modifier.fillMaxWidth())
        },
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.md),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
        ) {
            if (icon != null) EffyIconChip(icon)
            Text(title, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center, modifier = Modifier.semantics { heading() })
            Text(body, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
            if (error != null) EffyInlineError(error)
        }
    }
}
