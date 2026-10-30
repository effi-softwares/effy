package com.effyshopping.customer.mobile.features.saved.presentation

import com.effyshopping.customer.mobile.core.presentation.EffySnackbarHost
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.Stable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.session.SessionState
import com.effyshopping.customer.mobile.features.catalog.domain.ProductCard
import com.effyshopping.customer.mobile.features.saved.domain.GUEST_CAP
import com.effyshopping.customer.mobile.features.saved.domain.ToggleOutcome
import kotlinx.coroutines.launch

/**
 * The save control's screen-level wiring, for any surface with product tiles:
 *  1. One membership read per screen (`GET /v1/saved/ids`), never one per tile.
 *  2. Every control reads the same mirror, so two hearts for one product agree.
 *  3. A refusal is said (the mirror reverts on failure; the guest cap refuses deliberately).
 *
 * The membership read is signed-in only: a guest's mirror comes from the device, and adopting a guest's
 * failed (401) read as an empty set would clear the device list.
 */
@Composable
fun rememberSavedTiles(container: AppContainer, onRequireSignIn: (() -> Unit)? = null): SavedTiles {
    val session by container.session.state.collectAsState()
    val signedIn = session is SessionState.Authenticated
    val savedIds by container.savedStore.saved.collectAsState()
    val messages = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    // The product whose list chooser is open, or null. Rendered by [SavedTileMessages].
    val chooser = remember { mutableStateOf<String?>(null) }

    // One read on arrival, and one more if the shopper signs in while the screen is open - which is
    // the moment their hearts would otherwise still be showing a guest's list.
    LaunchedEffect(signedIn) {
        if (signedIn) runCatching { container.loadSavedMembership() }
    }

    return remember(savedIds, messages) {
        SavedTiles(savedIds, messages, container, chooser, onRequireSignIn) { product, wanted ->
            scope.launch {
                val outcome = runCatching {
                    container.toggleSaved(product.id, wanted, product.priceAmount, product.currency)
                }
                when (outcome.getOrNull()) {
                    null -> messages.showSnackbar(
                        if (wanted) "We couldn't save that just now. Please try again." else
                            "We couldn't remove that just now. Please try again.",
                    )
                    ToggleOutcome.GUEST_CAP -> messages.showSnackbar(
                        "You've saved $GUEST_CAP items on this device, which is the most we can keep " +
                            "before you sign in. Sign in to save more, or remove one first.",
                    )
                    // The product is in a list the shopper named. Nothing was removed;
                    // the chooser shows where it is and lets them decide.
                    ToggleOutcome.OPEN_CHOOSER -> chooser.value = product.id
                    // The save has already happened, in one tap. The other lists are an offer
                    // after it - one action on the snackbar, never a question before the save.
                    ToggleOutcome.DONE -> if (wanted) {
                        val result = messages.showSnackbar(
                            message = "Saved",
                            actionLabel = "Add to a list",
                            duration = SnackbarDuration.Short,
                        )
                        if (result == SnackbarResult.ActionPerformed) chooser.value = product.id
                    }
                }
            }
        }
    }
}

/**
 * What a tile-bearing screen needs to render save controls: the membership answer, one toggle, and
 * somewhere to say a refusal.
 *
 * Deliberately not a ViewModel. It holds no state of its own - the mirror is
 * [com.effyshopping.customer.mobile.features.saved.domain.SavedStore], which is app-scoped precisely
 * so that a screen cannot own a second copy of the answer.
 */
@Stable
class SavedTiles internal constructor(
    private val ids: Set<String>,
    /** Where a refusal is announced. Render it with [SavedTileMessages]. */
    val messages: SnackbarHostState,
    internal val container: AppContainer,
    internal val chooser: MutableState<String?>,
    internal val onRequireSignIn: (() -> Unit)?,
    private val onToggle: (ProductCard, Boolean) -> Unit,
) {
    fun isSaved(productId: String): Boolean = productId in ids

    fun toggle(product: ProductCard, wanted: Boolean) = onToggle(product, wanted)
}

/**
 * The tile placement, wired to the shared mirror - the overload every product grid and rail uses.
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

/**
 * Renders [SavedTiles.messages] and, when one is open, the list chooser. A screen that wires
 * save controls must render this, or a refusal is silent and a tap on a named-list heart does nothing.
 */
@Composable
fun SavedTileMessages(tiles: SavedTiles, modifier: Modifier = Modifier) {
    EffySnackbarHost(tiles.messages, modifier = modifier)
    tiles.chooser.value?.let { productId ->
        ListChooserSheet(
            container = tiles.container,
            productId = productId,
            onDismiss = { tiles.chooser.value = null },
            onRequireSignIn = tiles.onRequireSignIn,
        )
    }
}
