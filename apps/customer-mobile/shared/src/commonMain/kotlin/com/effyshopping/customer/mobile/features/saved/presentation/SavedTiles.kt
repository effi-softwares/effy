package com.effyshopping.customer.mobile.features.saved.presentation

import androidx.compose.foundation.layout.BoxScope
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.session.SessionState
import com.effyshopping.customer.mobile.features.catalog.domain.ProductCard
import com.effyshopping.customer.mobile.features.saved.domain.GUEST_CAP
import kotlinx.coroutines.launch

/**
 * The save control's SCREEN-LEVEL wiring, for any surface that shows product tiles (033 FR-007).
 *
 * ── Why this exists rather than four copies ──────────────────────────────────────────────────────
 *
 * Three things have to happen together for a heart on a tile to be honest, and each of them is a
 * documented defect if it is done differently on one screen than another:
 *
 *  1. **ONE membership read per screen** (FR-020), never one per tile. A per-tile read would make a
 *     grid of 40 products cost 40 requests and would slow first paint in proportion to how much the
 *     shopper is looking at — which is the reason the platform has a bulk `GET /v1/saved/ids` at all.
 *  2. **Every control reads the SAME mirror** (FR-013). Two controls for one product on one screen —
 *     a rail tile and a grid tile — must never disagree, and they cannot if neither owns a boolean.
 *  3. **A refusal is SAID.** The optimistic mirror reverts itself on failure, so without this the
 *     heart silently flips back and the shopper is left to guess whether it saved. The guest cap
 *     (FR-047) is the case that matters most: it refuses deliberately, and a refusal a shopper cannot
 *     see is indistinguishable from a bug.
 *
 * ⚠ THE MEMBERSHIP READ IS SIGNED-IN ONLY. A guest has no account list; their mirror is hydrated from
 * the device at construction (`SavedStore.init`) and asking the platform would answer `401`. Worse,
 * the read `adopt()`s its answer, and adopting an empty set from a guest's failed read would **clear
 * the device list** — the exact way a guest's saves get lost.
 */
@Composable
fun rememberSavedTiles(container: AppContainer): SavedTiles {
    val session by container.session.state.collectAsState()
    val signedIn = session is SessionState.Authenticated
    val savedIds by container.savedStore.saved.collectAsState()
    val messages = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    // One read on arrival, and one more if the shopper signs in while the screen is open — which is
    // the moment their hearts would otherwise still be showing a guest's list.
    LaunchedEffect(signedIn) {
        if (signedIn) runCatching { container.loadSavedMembership() }
    }

    return remember(savedIds, messages) {
        SavedTiles(savedIds, messages) { product, wanted ->
            scope.launch {
                // ⚠ THE PRICE TRAVELS WITH THE TAP so a GUEST's device records the baseline they
                // actually saw. Without it the merge falls back to the price at sign-in time and the
                // shopper silently loses the drop they were watching for.
                val outcome = runCatching {
                    container.toggleSaved(product.id, wanted, product.priceAmount, product.currency)
                }
                when {
                    outcome.isFailure -> messages.showSnackbar(
                        if (wanted) "We couldn't save that just now. Please try again." else
                            "We couldn't remove that just now. Please try again.",
                    )
                    // Only a save can be refused; an un-save is always allowed.
                    outcome.getOrDefault(true) == false -> messages.showSnackbar(
                        "You've saved $GUEST_CAP items on this device, which is the most we can keep " +
                            "before you sign in. Sign in to save more, or remove one first.",
                    )
                }
            }
        }
    }
}

/**
 * What a tile-bearing screen needs to render save controls: the membership answer, one toggle, and
 * somewhere to say a refusal.
 *
 * ⚠ Deliberately NOT a ViewModel. It holds no state of its own — the mirror is
 * [com.effyshopping.customer.mobile.features.saved.domain.SavedStore], which is app-scoped precisely
 * so that a screen cannot own a second copy of the answer.
 */
@Stable
class SavedTiles internal constructor(
    private val ids: Set<String>,
    /** Where a refusal is announced. Render it with [SavedTileMessages]. */
    val messages: SnackbarHostState,
    private val onToggle: (ProductCard, Boolean) -> Unit,
) {
    fun isSaved(productId: String): Boolean = productId in ids

    fun toggle(product: ProductCard, wanted: Boolean) = onToggle(product, wanted)
}

/**
 * The tile placement, wired to the shared mirror — the overload every product grid and rail uses.
 *
 * Goes in [com.effyshopping.customer.mobile.core.presentation.EffyProductCard]'s `imageOverlay` slot,
 * which puts it above the "Unavailable" scrim on purpose: a shopper must still be able to un-save
 * something that went out of stock, or it is stranded in their list.
 */
@Composable
fun BoxScope.TileSaveControl(product: ProductCard, tiles: SavedTiles) {
    TileSaveControl(
        saved = tiles.isSaved(product.id),
        onToggle = { wanted -> tiles.toggle(product, wanted) },
    )
}

/** Renders [SavedTiles.messages]. A screen that wires save controls MUST render this, or a refusal is silent. */
@Composable
fun SavedTileMessages(tiles: SavedTiles, modifier: Modifier = Modifier) {
    SnackbarHost(hostState = tiles.messages, modifier = modifier)
}
