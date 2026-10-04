package com.effyshopping.customer.mobile.features.saved.presentation

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import com.effyshopping.customer.mobile.features.saved.domain.SavedList
import com.effyshopping.customer.mobile.features.saved.domain.listNameRemaining
import com.effyshopping.mobile.design.EffySpacing

/**
 * The shopper's lists, in one place (068 FR-027): "Saved" first, each with its count.
 *
 * ⚠ TABS OVER ONE LIST OF ROWS, not a grid of list cards (Principle V). The row SCROLLS rather than
 * squeezing, so twenty lists stay one line and each tab keeps a full-height touch target.
 *
 * Rename and delete sit under the row and only for a list the shopper made: "Saved" cannot be
 * renamed or deleted, so neither is offered for it (FR-003).
 */
@Composable
fun SavedListsBar(
    lists: List<SavedList>,
    selectedId: String,
    onSelect: (String) -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit,
) {
    val index = lists.indexOfFirst { it.id == selectedId }.coerceAtLeast(0)
    ScrollableTabRow(selectedTabIndex = index, edgePadding = EffySpacing.lg) {
        lists.forEach { list ->
            Tab(
                selected = list.id == selectedId,
                onClick = { onSelect(list.id) },
                text = {
                    // Plain text. A list name is the shopper's own and is never interpreted.
                    Text("${list.label} (${list.count})", maxLines = 1, overflow = TextOverflow.Ellipsis)
                },
            )
        }
    }
    if (lists.getOrNull(index)?.isDefault == false) {
        Row(modifier = Modifier.fillMaxWidth().padding(horizontal = EffySpacing.s)) {
            TextButton(onClick = onRename) { Text("Rename list") }
            TextButton(onClick = onDelete) { Text("Delete list") }
        }
    }
}

/**
 * Name a new list, or rename one.
 *
 * [onSubmit] reports back the sentence to show when the platform refused (a taken name, a full set of
 * lists), or null when it went through — and only then does the dialog close, so what the shopper
 * typed is still there to correct.
 */
@Composable
fun ListNameDialog(
    title: String,
    confirmLabel: String,
    initial: String,
    onSubmit: (name: String, onResult: (String?) -> Unit) -> Unit,
    onDismiss: () -> Unit,
) {
    var name by remember { mutableStateOf(initial) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val remaining = listNameRemaining(name)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = {
                    name = it
                    error = null
                },
                label = { Text("Name") },
                singleLine = true,
                isError = error != null || remaining < 0,
                supportingText = {
                    Text(
                        error
                            ?: if (remaining < 0) "${-remaining} too many characters"
                            else "$remaining characters left",
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(
                enabled = !busy && name.isNotBlank() && remaining >= 0,
                onClick = {
                    busy = true
                    onSubmit(name) { refusal ->
                        busy = false
                        if (refusal == null) onDismiss() else error = refusal
                    }
                },
            ) { Text(confirmLabel) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/**
 * ⚠ BOTH NUMBERS, BEFORE ANYTHING IS DELETED (FR-006): what is in the list, and how much of it lives
 * nowhere else. The second is what the shopper actually loses — the delete un-saves exactly that many.
 */
@Composable
fun DeleteListDialog(list: SavedList, onConfirm: (onResult: (String?) -> Unit) -> Unit, onDismiss: () -> Unit) {
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Delete \"${list.label}\"?") },
        text = {
            Text(
                error ?: deleteSummary(list.count, list.onlyHereCount),
                color = if (error != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
            )
        },
        confirmButton = {
            TextButton(
                enabled = !busy,
                onClick = {
                    busy = true
                    onConfirm { refusal ->
                        busy = false
                        if (refusal == null) onDismiss() else error = refusal
                    }
                },
            ) { Text("Delete list", color = MaterialTheme.colorScheme.error) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** What deleting a list costs, in the shopper's terms. Word for word what customer-web says. */
fun deleteSummary(count: Int, onlyHereCount: Int): String {
    if (count == 0) return "This list is empty."
    val items = if (count == 1) "1 item" else "$count items"
    if (onlyHereCount == 0) return "This list has $items. All of them are in another list too, so they stay saved."
    val lost = if (onlyHereCount == 1) "1 of them isn't in any other list and will no longer be saved."
    else "$onlyHereCount of them aren't in any other list and will no longer be saved."
    return "This list has $items. $lost"
}
