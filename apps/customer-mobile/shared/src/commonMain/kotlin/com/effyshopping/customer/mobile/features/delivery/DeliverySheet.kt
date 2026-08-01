package com.effyshopping.customer.mobile.features.delivery

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.features.localities.domain.Locality
import com.effyshopping.customer.mobile.features.localities.domain.LocalityResult
import com.effyshopping.customer.mobile.features.localities.domain.SearchLocalities
import com.effyshopping.mobile.design.EffySpacing
import kotlinx.coroutines.delay

/**
 * "Where do you want this delivered?" — as a **bottom sheet** (030 FR-026, operator direction).
 *
 * It replaces the centre-screen `AlertDialog` 025 shipped. A sheet that rises from the bottom edge is
 * the platform's own convention for this kind of task and, more practically, it is reachable
 * one-handed on a phone — which a centre-screen dialog with its actions at the top is not (FR-032).
 *
 * ── What it carries ────────────────────────────────────────────────────────────────────────────
 *
 * Everything needed to name a place AND the answer (FR-027, FR-028): the shopper never leaves the
 * sheet to learn whether Effy delivers, and can try somewhere else without reopening it (FR-029).
 *
 * ── ⚠ THREE NON-ANSWERS, THREE MESSAGES, NONE OF THEM A REFUSAL ────────────────────────────────
 *
 *   too short          → "keep typing"
 *   no match           → "we don't recognise that place"
 *   lookup failed      → "we couldn't look that up"
 *
 * Not one of them may read as "we don't deliver there". That is a different question with its own
 * answer, and conflating them is the single failure this whole capability exists to prevent
 * (FR-012, FR-013). It is also the thing five testers are asked to distinguish at sign-off (SC-003).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeliverySheet(
    store: DeliveryContextStore,
    searchLocalities: SearchLocalities,
    onCheck: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val context by store.state.collectAsState()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    var query by remember { mutableStateOf("") }
    var result by remember { mutableStateOf<LocalityResult?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    // ── The lookup: debounced, and superseded results are discarded ────────────────────────────
    //
    // ⚠ `LaunchedEffect(query)` cancels the previous coroutine when `query` changes, which is what
    // makes this correct rather than merely throttled: type "Rich" then "Richm" and the slower
    // "Rich" response can never repaint the list under a finger that has already moved on. Same
    // staleness rule the store applies to the verdict (025), one level earlier.
    LaunchedEffect(query) {
        val q = query.trim()
        if (q.length < 2) {
            result = null
            return@LaunchedEffect
        }
        delay(DEBOUNCE_MS)
        result = runCatching { searchLocalities(q) }.getOrElse { LocalityResult.Failed }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                // ⚠ `imePadding` is why the results list stays usable: the sheet resizes for the soft
                // keyboard instead of being covered by it. Neither existing ModalBottomSheet in this
                // app has a scrolling list inside it, so this is the genuinely new part (research R9).
                .imePadding()
                .navigationBarsPadding()
                .padding(horizontal = EffySpacing.lg)
                .padding(top = EffySpacing.s, bottom = EffySpacing.xxxl),
            // ⚠ SPACING CARRIES THE GROUPING, so it is not uniform. This is the gap BETWEEN groups;
            // things that belong together are nested in their own Column with a smaller gap. A single
            // even rhythm reads as one undifferentiated stack — which is what the first device run
            // looked like — because a heading sits as far from its own subtitle as it does from an
            // unrelated control.
            verticalArrangement = Arrangement.spacedBy(EffySpacing.xl),
        ) {
            // The heading and its subtitle are ONE unit — tight together, far from everything else.
            Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.xs)) {
                Text("Delivery location", style = MaterialTheme.typography.titleMedium)
                Text(
                    "We’ll tell you straight away whether we deliver to you.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            OutlinedTextField(
                value = query,
                onValueChange = {
                    query = it
                    error = null
                },
                label = { Text("Suburb or postcode") },
                placeholder = { Text("Richmond, or 3121") },
                singleLine = true,
                isError = error != null,
                supportingText = error?.let { { Text(it) } },
                // ⚠ NOT a numeric keyboard. 025's field was postcode-only and used one; this input
                // accepts a suburb name, and a number pad would make the feature unusable for exactly
                // the shopper it exists for.
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    imeAction = ImeAction.Search,
                ),
                modifier = Modifier.fillMaxWidth(),
            )

            when (val r = result) {
                is LocalityResult.Places ->
                    if (r.places.isEmpty()) {
                        Hint("We don’t recognise that place. Check the spelling, or enter a 4-digit postcode.")
                    } else {
                        PlaceList(
                            places = r.places,
                            onPick = { place ->
                                val postcode = store.setPlace(place.name, place.state, place.postcode)
                                if (postcode != null) {
                                    error = null
                                    onCheck(postcode)
                                }
                            },
                        )
                    }
                // ⚠ "Keep typing", not a refusal and not "no such place".
                LocalityResult.Invalid -> Hint("Keep typing to see matching places.")
                LocalityResult.Failed ->
                    Hint("We couldn’t look that up just now. You can still enter a 4-digit postcode.")
                null -> Unit
            }

            context?.let { ctx ->
                Column(
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    verticalArrangement = Arrangement.spacedBy(EffySpacing.xs),
                ) {
                    HorizontalDivider(modifier = Modifier.padding(bottom = EffySpacing.md))
                    Text(formatPlace(ctx), style = MaterialTheme.typography.bodyLarge)
                    Text(
                        when (ctx.serviced) {
                            true -> "We deliver here"
                            false -> "We don’t deliver here yet — you can keep browsing"
                            null -> "Checking…"
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // ── The actions ────────────────────────────────────────────────────────────────
            //
            // ⚠ FULL-WIDTH AND STACKED, not a side-by-side row of text buttons. Three reasons:
            //
            //  1. A `TextButton` is Material's LOWEST-emphasis control — right for "cancel", wrong for
            //     the one action this sheet exists to perform. Setting a location is the primary
            //     action, so it gets the filled button.
            //  2. Side by side, each button is roughly half the sheet wide and neither reaches the
            //     comfortable thumb arc on a phone. Full-width rows are reachable one-handed from
            //     either hand, which is what SC-009 is walked against.
            //  3. Stacking makes the hierarchy explicit: Check is what you came for, Clear is a way
            //     back out. On one row they read as two equal choices.
            //
            // ⚠ Clear is OUTLINED, not error-coloured. Removing your own location is reversible in one
            // tap and is not a destructive act — and the palette has exactly two semantic colours, with
            // error reserved for real errors (Principle V).
            Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
                Button(
                    onClick = {
                        // A bare postcode still works exactly as it did (FR-007) — the shopper who
                        // knows their postcode types four digits and is not made to pick from a list.
                        val postcode = store.setPostcode(query)
                        if (postcode == null) {
                            // ⚠ "That isn't a place we know" — deliberately NOT "we don't deliver there".
                            error = "Enter a suburb or a 4-digit postcode."
                        } else {
                            error = null
                            onCheck(postcode)
                        }
                    },
                    // 52dp: comfortably above the platform minimum, and the height a primary action
                    // wants when it is the last thing above the keyboard (FR-032).
                    modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                ) { Text("Check") }

                if (context != null) {
                    OutlinedButton(
                        onClick = {
                            store.clear()
                            query = ""
                            result = null
                        },
                        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                    ) { Text("Clear location") }
                }
            }
        }
    }
}

@Composable
private fun PlaceList(places: List<Locality>, onPick: (Locality) -> Unit) {
    // Bounded so the list stays scannable above the keyboard (FR-010); the server already caps at 8.
    LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 240.dp)) {
        items(places, key = { "${it.name}|${it.state}|${it.postcode}" }) { place ->
            TextButton(
                onClick = { onPick(place) },
                // ⚠ 48dp: a suggestion is a touch target, not a line of text (FR-032, Principle V).
                modifier = Modifier.fillMaxWidth().sizeIn(minHeight = 48.dp),
            ) {
                Text(
                    // Every place shows name + state + postcode together. A bare name is not
                    // selectable, because in Australia it does not identify anywhere (FR-008).
                    "${place.name} ${place.state} ${place.postcode}",
                    modifier = Modifier.fillMaxWidth(),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    }
}

@Composable
private fun Hint(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

/** 200 ms: long enough that a five-character suburb costs one request, short enough to feel live. */
private const val DEBOUNCE_MS = 200L
