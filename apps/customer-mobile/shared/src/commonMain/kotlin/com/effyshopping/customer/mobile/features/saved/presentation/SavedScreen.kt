package com.effyshopping.customer.mobile.features.saved.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyEmptyState
import com.effyshopping.customer.mobile.core.presentation.EffyProductCard
import com.effyshopping.customer.mobile.core.presentation.EffySegmentedToggle
import com.effyshopping.customer.mobile.core.presentation.EffyPullToRefresh
import com.effyshopping.customer.mobile.core.presentation.ProductGridGutter
import com.effyshopping.customer.mobile.core.presentation.ProductGridPadding
import com.effyshopping.customer.mobile.core.presentation.ProductGridRowGap
import com.effyshopping.customer.mobile.core.presentation.money
import com.effyshopping.customer.mobile.features.catalog.domain.ProductBadge
import com.effyshopping.customer.mobile.features.catalog.domain.ProductCard
import com.effyshopping.customer.mobile.features.saved.domain.SavedItem
import com.effyshopping.customer.mobile.features.saved.domain.SavedVerdict
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_favorite_outlined
import com.effyshopping.mobile.design.EffySpacing

/**
 * Saved items (033) — the watchlist.
 *
 * ⚠ A grid of product tiles, not a bespoke row. Principle V bars CARD LAYOUTS — bordered/elevated
 * boxes tiling a page and metric cards at the top of one. `EffyProductCard` is neither: no border, no
 * shadow, and it is the platform's single product presentation, already used on Home, Search, Browse
 * and Category. A second product presentation invented for this one screen is precisely the drift
 * EffyRailTile's comment warns about, so the justification is recorded here and in research R18.
 */
@Composable
fun SavedScreen(
    container: AppContainer,
    onOpen: (String) -> Unit,
    onBack: () -> Unit,
    onBrowse: () -> Unit,
    onChangeLocation: () -> Unit,
) {
    val vm = remember {
        SavedViewModel(
            listSaved = container.listSaved,
            loadMembership = container.loadSavedMembership,
            removeSaved = container.removeSaved,
            undoRemove = container.undoRemoveSaved,
            postcode = { container.deliveryContext.state.value?.postcode },
        )
    }
    val state by vm.state.collectAsState()
    val savedIds by container.savedStore.saved.collectAsState()
    val delivery by container.deliveryContext.state.collectAsState()
    // ⚠ CLIENT-SIDE (FR-056). The set is capped at 200 and already in memory, so a round trip per
    // sort would be latency the shopper feels on a control that should be instant.
    var order by remember { mutableStateOf(SavedOrder.RECENT) }

    // ⚠ FR-039: when the shopper changes delivery location, EVERY verdict has to be re-decided —
    // "not delivered to your area" is an answer about one address, and it stops being true the moment
    // they pick another. Keying on the postcode means the list re-reads rather than showing a verdict
    // for somewhere the shopper has left. Without this the screen answers for wherever they happened
    // to be when it opened.
    LaunchedEffect(delivery?.postcode) { vm.refresh() }

    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = "Saved items", onBack = onBack)

        when (val s = state) {
            is SavedUiState.Loading -> EffyPullToRefresh(onRefresh = { vm.refresh() }) {
                Column(Modifier.fillMaxSize()) {}
            }

            is SavedUiState.Error -> EffyEmptyState(
                title = "We couldn't load your saved items",
                body = "Check your connection and try again.",
                icon = Res.drawable.ic_favorite_outlined,
                actionLabel = "Try again",
                onAction = vm::retry,
            )

            is SavedUiState.Ready -> when {
                // ⚠ TWO DISTINCT EMPTY STATES (FR-057). "You have never saved anything" and "you have
                // saved things but none can be delivered where you are" are different situations, and
                // a single message would leave the second shopper thinking their list was lost.
                s.items.isEmpty() -> EffyEmptyState(
                    title = "Nothing saved yet",
                    // ⚠ FR-027: guest saves are DEVICE-HELD, and saying so is the difference between
                    // a deliberate design and an apparent bug when they sign in on another phone.
                    body = "Tap the heart on anything you want to keep an eye on. " +
                        "We'll tell you when the price drops or it comes back in stock. " +
                        "Saved before signing in? Those stay on this device until you sign in.",
                    icon = Res.drawable.ic_favorite_outlined,
                    actionLabel = "Start shopping",
                    onAction = onBrowse,
                )

                s.items.none { it.verdict.isPurchasable } && s.items.any {
                    it.verdict == SavedVerdict.NOT_DELIVERED_TO_YOUR_AREA
                } -> EffyEmptyState(
                    title = "Nothing here reaches your address",
                    body = "Your saved items are safe — we just can't deliver any of them to where " +
                        "you're shopping right now. Try a different delivery location.",
                    icon = Res.drawable.ic_favorite_outlined,
                    actionLabel = "Change location",
                    onAction = onChangeLocation,
                )

                else -> Column(Modifier.fillMaxSize()) {
                    // ⚠ Only shown when there is enough to sort. A control over three items is noise.
                    if (s.items.size > 3) {
                        EffySegmentedToggle(
                            options = SavedOrder.entries,
                            selected = order,
                            label = { it.label },
                            onSelect = { order = it },
                            modifier = Modifier.padding(
                                horizontal = EffySpacing.lg,
                                vertical = EffySpacing.s,
                            ),
                        )
                    }

                    EffyPullToRefresh(onRefresh = { vm.refresh() }) {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        horizontalArrangement = Arrangement.spacedBy(ProductGridGutter),
                        verticalArrangement = Arrangement.spacedBy(ProductGridRowGap),
                        contentPadding = ProductGridPadding,
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        items(s.items.sortedFor(order), key = { it.productId }) { item ->
                            SavedTile(
                                item = item,
                                saved = item.productId in savedIds,
                                onOpen = onOpen,
                                onToggle = { wanted ->
                                    if (!wanted) vm.remove(item)
                                },
                            )
                        }
                    }
                    }
                }
            }
        }
    }
}

@Composable
private fun SavedTile(
    item: SavedItem,
    saved: Boolean,
    onOpen: (String) -> Unit,
    onToggle: (Boolean) -> Unit,
) {
    Column(modifier = Modifier.fillMaxHeight()) {
        EffyProductCard(
            product = item.toProductCard(),
            onClick = onOpen,
            modifier = Modifier.fillMaxWidth(),
            fillHeight = false,
            imageOverlay = { TileSaveControl(saved = saved, onToggle = onToggle) },
        )

        // ⚠ The watchlist's whole reason for existing: what CHANGED since it was saved.
        if (item.priceDropped) {
            Text(
                text = "was ${money(item.savedPriceAmount, item.currency)}",
                style = MaterialTheme.typography.bodySmall.copy(
                    textDecoration = TextDecoration.LineThrough,
                ),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = EffySpacing.xs),
            )
        }

        // ⚠ ONE SENTENCE PER OUTCOME, and they are deliberately different sentences. "Unavailable"
        // and "we don't deliver that to you" imply different next actions — wait, versus change your
        // address — and a shopper who cannot tell them apart cannot act (FR-036).
        val note = when (item.verdict) {
            SavedVerdict.PURCHASABLE -> null
            SavedVerdict.TEMPORARILY_UNAVAILABLE -> "Out of stock right now"
            SavedVerdict.NOT_DELIVERED_TO_YOUR_AREA -> "Not delivered to your area"
            SavedVerdict.NO_LONGER_SOLD -> "No longer sold"
            SavedVerdict.NOT_YET_DETERMINED -> "Tell us where you live to check"
        }
        if (note != null) {
            Text(
                text = note,
                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = EffySpacing.xs),
            )
        }

        TextButton(onClick = { onToggle(false) }) { Text("Remove") }
    }
}

/**
 * Map a saved item onto the shared product tile.
 *
 * ⚠ `available` here is the TILE's own scrim flag, and it is fed from the verdict rather than from a
 * catalogue boolean — which is the entire correction this feature makes. The saved-item contract
 * deliberately carries NO `available` field for exactly that reason.
 */
private fun SavedItem.toProductCard() = ProductCard(
    id = productId,
    name = name,
    brand = brand,
    imageUrl = imageUrl,
    priceAmount = priceAmount,
    currency = currency,
    compareAtAmount = compareAtAmount,
    // ⚠ Carried through, not dropped. The predecessor passed emptyList() here while the backend was
    // computing them, so a sale on a saved item was invisible on this screen alone.
    badges = badges.mapNotNull {
        when (it) {
            "on_sale" -> ProductBadge.ON_SALE
            "new" -> ProductBadge.NEW
            else -> null
        }
    },
    available = verdict.isPurchasable,
)


/** How the saved list is ordered (FR-056). */
enum class SavedOrder(val label: String) {
    RECENT("Recent"),
    AVAILABLE("Available"),
    AISLE("Aisle"),
}

/**
 * ⚠ `sortedBy` returns a NEW list rather than sorting in place — the state list must not be mutated
 * out from under Compose.
 *
 * "By aisle" is grocery-native: a shopper walking a list thinks in categories, not in save order.
 * Items with no category sink to the end rather than forming a phantom group.
 */
private fun List<SavedItem>.sortedFor(order: SavedOrder): List<SavedItem> = when (order) {
    // The server already returns newest-first; this is the identity order and stays cheap.
    SavedOrder.RECENT -> this
    SavedOrder.AVAILABLE -> sortedByDescending { it.verdict.isPurchasable }
    SavedOrder.AISLE -> sortedBy { it.categoryKey ?: "\uffff" }
}
