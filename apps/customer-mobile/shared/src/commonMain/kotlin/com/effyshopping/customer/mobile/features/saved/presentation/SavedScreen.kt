package com.effyshopping.customer.mobile.features.saved.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyEmptyState
import com.effyshopping.customer.mobile.core.presentation.EffyPullToRefresh
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.customer.mobile.core.presentation.EffySegmentedToggle
import com.effyshopping.customer.mobile.core.presentation.EffySkeletonBlock
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.customer.mobile.core.presentation.ProductImage
import com.effyshopping.customer.mobile.core.presentation.money
import com.effyshopping.customer.mobile.core.util.newUuid
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartLine
import com.effyshopping.customer.mobile.features.saved.domain.SavedAddToCartOutcome
import com.effyshopping.customer.mobile.features.saved.domain.SavedItem
import com.effyshopping.customer.mobile.features.saved.domain.SavedVerdict
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_delete_outlined
import com.effyshopping.customer.mobile.resources.ic_favorite_outlined
import com.effyshopping.mobile.design.EffyRadius
import com.effyshopping.mobile.design.EffySpacing
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.painterResource

/**
 * Saved items (033) — the watchlist.
 *
 * ⚠ A VERTICAL LIST, built from the same primitives as the cart — NOT a product grid.
 *
 * It was a two-column `EffyProductCard` grid, and research R18 justified that as "the platform's one
 * product presentation". That justification held for a *catalogue* surface, where the question a
 * shopper is asking is "which of these do I want?" and a big photograph answers it. This screen
 * answers a different question — "what changed, and can I buy it yet?" — and every part of that
 * answer is TEXT: the price now, the price when it was saved, and one sentence per verdict. A tile
 * gives that text a half-width column under a square photograph, so a struck-through was-price and a
 * verdict note wrap into three ragged lines and the two tiles in a row disagree in height. The cart
 * already solved the same problem for the same shopper: a full-width row, a small thumbnail, and the
 * controls on their own line underneath where their width is not somebody else's leftovers. Reusing
 * that composition is Principle II's rule applied to layout, and it moves the screen TOWARD Principle
 * V's "prefer tables, lists, sectioned pages and detail rows" rather than away from it — it is also
 * what `customer-web`'s saved list has always done, so the two surfaces now read the same.
 *
 * ⚠ PULL TO REFRESH IS AVAILABLE IN EVERY STATE, including loading and error. "Is this list stale?"
 * is a question a shopper asks hardest exactly when the screen is showing them nothing — and the
 * gesture needs something SCROLLABLE to hang off, which is why the loading state is a column of
 * skeleton rows and the empty/error states scroll inside a centred column (the 027 cart fix: a plain
 * `verticalScroll` Column top-aligns, so `fillMaxSize` + `Arrangement.Center` keeps the composition).
 */
@Composable
fun SavedScreen(
    container: AppContainer,
    onOpen: (String) -> Unit,
    onBack: () -> Unit,
    onBrowse: () -> Unit,
    onCart: () -> Unit = {},
) {
    val vm = remember {
        SavedViewModel(
            listSaved = container.listSaved,
            loadMembership = container.loadSavedMembership,
            removeSaved = container.removeSaved,
            undoRemove = container.undoRemoveSaved,
        )
    }
    val state by vm.state.collectAsState()
    val pendingUndo by vm.undo.collectAsState()
    // ⚠ WHAT IS ALREADY IN THE CART, read from the cart's own mirror — never a second copy.
    //
    // An item STAYS on the list after being added (FR-050): this is a watchlist, and the save-time
    // price it is watching against would be destroyed by consuming the entry. eBay's watchlist behaves
    // the same way, and the constitution names eBay as this capability's reference.
    //
    // But a row that keeps saying "Add to cart" when the thing is already in the cart invites the
    // shopper to tap again — and a second tap does not no-op, it increments the quantity. So the row
    // says where the item is and offers the way there, which is eBay's answer to the same problem.
    val cart by container.cart.state.collectAsState()
    val inCart = cart.lines.associate { it.productId to it.quantity }
    val snackbarHost = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    // ⚠ CLIENT-SIDE (FR-056). The set is capped at 200 and already in memory, so a round trip per
    // sort would be latency the shopper feels on a control that should be instant.
    var order by remember { mutableStateOf(SavedOrder.RECENT) }
    var bulk by remember { mutableStateOf<SavedAddToCartOutcome?>(null) }
    var bulkBusy by remember { mutableStateOf(false) }

    // ⚠ The mirror is re-checked on arrival, because this screen now RENDERS from it. A cart filled on
    // another device would otherwise leave every row offering "Add to cart" for something already in
    // there — which is the defect this whole feature exists to remove, one list over. A failure changes
    // nothing: the mirror stays and the rows degrade to "Add to cart", never to a false "in your cart".
    LaunchedEffect(Unit) { runCatching { container.syncCart() } }

    /**
     * Removal offers UNDO (FR-017), and the item comes back in the position it held (FR-018).
     *
     * ⚠ The ViewModel has published this since the slice was built and nothing rendered it, so a
     * mis-tap on the list was unrecoverable — the same one-tap mistake the cart's own undo exists to
     * forgive.
     */
    LaunchedEffect(pendingUndo) {
        val undo = pendingUndo ?: return@LaunchedEffect
        val result = snackbarHost.showSnackbar(
            message = "Removed ${undo.item.name}",
            actionLabel = "Undo", // at most ONE action
            duration = SnackbarDuration.Short,
        )
        if (result == SnackbarResult.ActionPerformed) vm.undoRemoval() else vm.dismissUndo()
    }

    /**
     * Add one saved item to the cart (FR-049).
     *
     * ⚠ It stays on the list (FR-050). A watchlist entry is not consumed by being bought — the whole
     * point is to keep watching what it costs.
     */
    fun addOne(item: SavedItem) {
        container.addToCart(
            GuestCartLine(
                productId = item.productId,
                name = item.name,
                imageUrl = item.imageUrl,
                unitPriceAmount = item.priceAmount,
                currency = item.currency,
                quantity = 1,
                // ⚠ The saved-item contract carries no package token — it is captured at add time from
                // a storefront read, and this list is not one. A blank key degrades to a single
                // anonymous package (021 FR-005a), which the platform re-decides on the next re-price.
            ),
        )
        scope.launch { snackbarHost.showSnackbar("${item.name} added to your cart") }
    }

    /**
     * Add everything purchasable in one action (FR-051).
     *
     * ⚠ THE SERVER decides what goes in. A client filtering by its own copy of the verdict would be
     * re-implementing the predicate and the two would drift — the exact class of defect this feature
     * exists to remove.
     *
     * ⚠ HOW THE OUTCOME IS REPORTED, and why it changed. FR-052 forbids silent omission, and the first
     * build met that with a block of prose pinned above the list: a count, "These weren't added:", and
     * one line per item. On a phone that pushed the products themselves below the fold and stayed there
     * — a transient result occupying permanent space, saying at the top of the screen what belongs
     * beside the item it is about. Now the outcome is a **toast** (the count, which is the part a
     * shopper reads once) and the reason travels **to the row it concerns** as [bulkSkips]. Nothing is
     * omitted; it is simply said where it means something.
     */
    fun addAll() {
        if (bulkBusy) return
        bulkBusy = true
        scope.launch {
            try {
                val outcome = container.addAllSavedToCart(postcode = null, changeId = newUuid())
                bulk = outcome
                // The platform wrote to the account cart; the local mirror has not heard about it yet.
                container.syncCart()
                snackbarHost.showSnackbar(bulkSummary(outcome))
            } catch (_: Throwable) {
                // Transient — the cart is unchanged and the shopper can try again.
                snackbarHost.showSnackbar("We couldn't add those just now. Please try again.")
            } finally {
                bulkBusy = false
            }
        }
    }

    // ⚠ The snackbar is an OVERLAY at the bottom, not a row in the column.
    //
    // As a column child it reserved layout space at the TOP of the screen and shoved the content down
    // whenever it appeared — which is a banner, not a toast. Over the bottom of the screen it covers
    // the action bar for a few seconds and takes nothing away permanently, which is the whole point of
    // a transient message.
    Box(modifier = Modifier.fillMaxSize()) {
    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = "Saved items", onBack = onBack)

        when (val s = state) {
            // ⚠ A CONTENT-SHAPED skeleton, not an empty box. The old loading state rendered a bare
            // `Column {}` inside the refresh container — nothing to scroll, so the gesture it was
            // wrapped in could not fire, and nothing to look at while it could not.
            is SavedUiState.Loading -> EffyPullToRefresh(
                onRefresh = { vm.refresh() },
                modifier = Modifier.weight(1f).fillMaxWidth(),
            ) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(horizontal = EffySpacing.lg),
                ) {
                    items(SkeletonRowCount) { SavedRowSkeleton() }
                }
            }

            is SavedUiState.Error -> EffyPullToRefresh(
                onRefresh = { vm.refresh() },
                modifier = Modifier.weight(1f).fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.Center,
                ) {
                    EffyEmptyState(
                        title = "We couldn't load your saved items",
                        body = "Check your connection and try again.",
                        icon = Res.drawable.ic_favorite_outlined,
                        actionLabel = "Try again",
                        onAction = vm::retry,
                    )
                }
            }

            is SavedUiState.Ready -> when {
                // ⚠ ONE empty state, and it means ONE thing: the shopper has saved nothing.
                //
                // ⚠ THERE USED TO BE A SECOND. When nothing in the list could be delivered, this
                // screen replaced the WHOLE LIST with "Nothing here reaches your address" — hiding
                // items the shopper had deliberately saved and making it look like the list had been
                // lost. That is FR-041's rule ("a withdrawn product must not silently vanish") broken
                // one level up, and it over-read FR-057: the spec asks for a distinct MESSAGE, not for
                // the list to be replaced by one. The per-item verdict already says which items
                // cannot come, and the items always render.
                s.items.isEmpty() -> EffyPullToRefresh(
                    onRefresh = { vm.refresh() },
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.Center,
                    ) {
                        EffyEmptyState(
                            title = "Nothing saved yet",
                            // ⚠ FR-027: guest saves are DEVICE-HELD, and saying so is the difference
                            // between a deliberate design and an apparent bug when they sign in on
                            // another phone.
                            body = "Tap the heart on anything you want to keep an eye on. " +
                                "We'll tell you when the price drops or it comes back in stock. " +
                                "Saved before signing in? Those stay on this device until you sign in.",
                            icon = Res.drawable.ic_favorite_outlined,
                            actionLabel = "Start shopping",
                            onAction = onBrowse,
                        )
                    }
                }

                else -> {
                    val shown = s.items.sortedFor(order)
                    val purchasable = s.items.filter { it.verdict.isPurchasable }
                    val anyPurchasable = purchasable.isNotEmpty()
                    val everythingAvailableInCart =
                        anyPurchasable && purchasable.all { inCart.containsKey(it.productId) }
                    // The reasons from the last bulk add, keyed by product so each one can be shown on
                    // the row it belongs to instead of in a report at the top of the screen.
                    val skips = bulk?.skipped.orEmpty().associate { it.productId to it.reason }

                    EffyPullToRefresh(
                        onRefresh = { vm.refresh() },
                        modifier = Modifier.weight(1f).fillMaxWidth(),
                    ) {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize().padding(horizontal = EffySpacing.lg),
                        ) {
                            // ⚠ Only shown when there is enough to sort. A control over three items is
                            // noise. It scrolls with the list — unlike the bulk action below, it is not
                            // worth permanent space.
                            if (s.items.size > 3) {
                                item(key = "sort") {
                                    EffySegmentedToggle(
                                        options = SavedOrder.entries,
                                        selected = order,
                                        label = { it.label },
                                        onSelect = { order = it },
                                        modifier = Modifier.padding(vertical = EffySpacing.s),
                                    )
                                }
                            }

                            items(shown, key = { it.productId }) { item ->
                                SavedRow(
                                    item = item,
                                    cartQuantity = inCart[item.productId] ?: 0,
                                    skipNote = skips[item.productId]?.let(::skipReason),
                                    onOpen = onOpen,
                                    onAddToCart = { addOne(item) },
                                    onGoToCart = onCart,
                                    onRemove = { vm.remove(item) },
                                )
                                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                            }
                        }
                    }

                    // ── The one committing action, PINNED (025 FR-030's rule for the cart, here too) ──
                    //
                    // ⚠ It used to be the list's first item, which is where the screen's most
                    // important control is least reachable: it scrolled away the moment the shopper
                    // started reading, and it sat at the TOP of a phone, furthest from the thumb. The
                    // cart puts "Go To Checkout" in a fixed bar for exactly these reasons and this is
                    // the same kind of action — one that commits everything on the screen at once.
                    if (anyPurchasable) {
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                        Column(modifier = Modifier.padding(EffySpacing.lg)) {
                            // ⚠ The bar answers the same question the rows do. When everything
                            // available is ALREADY in the cart, "Add everything available to cart" is
                            // an invitation to buy two of each — the bulk add is not idempotent across
                            // taps (each tap is a new batch; only a retry of ONE batch is deduped). So
                            // at that point the action becomes the useful one instead of the harmful
                            // one.
                            if (everythingAvailableInCart) {
                                EffyPrimaryButton(label = "Go to cart", onClick = onCart)
                            } else {
                                EffyPrimaryButton(
                                    label = "Add everything available to cart",
                                    onClick = ::addAll,
                                    enabled = !bulkBusy,
                                )
                            }
                        }
                    }
                }
            }
        }
    }

        SnackbarHost(
            hostState = snackbarHost,
            modifier = Modifier.align(Alignment.BottomCenter).padding(EffySpacing.s),
        )
    }
}

/**
 * One saved item — the cart row's composition, carrying the watchlist's own facts.
 *
 * ⚠ TWO STACKED ROWS, for the reason `CartRow` records: controls sharing a row with a two-line
 * product name get whatever width is left after a thumbnail and a price, which on a phone is not
 * enough, and Compose then squeezes the labels into wrapped nonsense. The actions get their own
 * full-width line.
 */
@Composable
private fun SavedRow(
    item: SavedItem,
    /**
     * Why the last bulk add left this item out (FR-052), or null.
     *
     * ⚠ It belongs HERE rather than in a report above the list. "SunRice Premium Long Grain White Rice
     * 1kg — couldn't be added right now" printed at the top of the screen makes the shopper match a
     * name to a row; on the row it names nothing and simply says what happened.
     */
    skipNote: String?,
    /** How many of this product are already in the cart — 0 when none. */
    cartQuantity: Int,
    onOpen: (String) -> Unit,
    onAddToCart: () -> Unit,
    onGoToCart: () -> Unit,
    onRemove: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = EffySpacing.md)) {
        Row(
            modifier = Modifier.fillMaxWidth().clickable { onOpen(item.productId) },
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
        ) {
            Box(
                modifier = Modifier
                    .size(72.dp)
                    .clip(RoundedCornerShape(EffyRadius.md))
                    .background(EffySurface.tint),
            ) {
                ProductImage(item.imageUrl, item.name, modifier = Modifier.fillMaxSize())
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(EffySpacing.xs),
            ) {
                Text(
                    item.name,
                    style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
                    // A long grocery name is three lines of a phone's width; the full one is on the
                    // product page.
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                item.brand?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                // ⚠ ONE SENTENCE PER OUTCOME, and they are deliberately different sentences.
                // "Out of stock" and "no longer sold" imply different next actions — wait, versus give
                // up — and a shopper who cannot tell them apart cannot act (FR-036).
                //
                // ⚠ The words carry the whole meaning. The palette is monochrome, so colour is not
                // available to say this and is not asked to (SC-009).
                val note = when (item.verdict) {
                    SavedVerdict.PURCHASABLE -> null
                    SavedVerdict.TEMPORARILY_UNAVAILABLE -> "Out of stock right now"
                    SavedVerdict.NO_LONGER_SOLD -> "No longer sold"
                }
                if (note != null) {
                    Text(
                        note,
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Medium),
                        color = MaterialTheme.colorScheme.error,
                    )
                }

                // ⚠ The bulk add's own refusal, which is NOT the same thing as the verdict above. An
                // item can be perfectly purchasable and still be turned away by the cart — because the
                // cart is full, say — and flattening the two would tell the shopper the product is
                // unavailable when it is their cart that is.
                if (skipNote != null) {
                    Text(
                        "Not added — $skipNote",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }

            Column(horizontalAlignment = Alignment.End) {
                Text(
                    money(item.priceAmount, item.currency),
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                )
                // ⚠ The watchlist's whole reason for existing: what CHANGED since it was saved. There
                // is deliberately no equivalent for a rise (FR-044) — the current price is always
                // shown, so nothing is concealed, but a rise is not something a shopper can act on.
                if (item.priceDropped) {
                    Text(
                        "was ${money(item.savedPriceAmount, item.currency)}",
                        style = MaterialTheme.typography.labelSmall.copy(
                            textDecoration = TextDecoration.LineThrough,
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.s),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // ⚠ Offered ONLY when the platform says the item is purchasable. Offering it otherwise is
            // the predecessor's defect in miniature: an invitation into a checkout that refuses you.
            //
            // ⚠ ONCE IT IS IN THE CART THE ACTION CHANGES — eBay's watchlist pattern, and the reason
            // is not tidiness. The item deliberately STAYS on this list (FR-050), so a row that went on
            // saying "Add to cart" would be inviting a tap that does not no-op: `addLine` increments,
            // so the shopper quietly ends up with two. Saying where it went, and offering the way
            // there, is the whole fix.
            //
            // ⚠ NOT a quantity stepper. That is the grocery pattern (Woolworths, Coles) and it belongs
            // on a catalogue tile, where the shopper is deciding how much to buy. Here they are
            // reviewing a watchlist, and quantity is the cart's business — putting a stepper on this
            // screen would make two places responsible for one number.
            when {
                !item.verdict.isPurchasable -> Unit
                cartQuantity > 0 -> TextButton(onClick = onGoToCart) {
                    // The count is stated because "in your cart" is not the same fact as "two of these
                    // are in your cart", and a shopper who tapped twice by accident can only find that
                    // out here or at the till.
                    Text(if (cartQuantity == 1) "In your cart · View" else "$cartQuantity in your cart · View")
                }
                else -> TextButton(onClick = onAddToCart) { Text("Add to cart") }
            }
            Spacer(Modifier.weight(1f))
            // The cart's destructive icon, in the cart's error tint — one visual language for "this
            // takes the thing away", both places it can happen. Removal is undoable (FR-017).
            IconButton(onClick = onRemove) {
                Icon(
                    painterResource(Res.drawable.ic_delete_outlined),
                    contentDescription = "Remove ${item.name} from saved items",
                    tint = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

/**
 * What a bulk add did, in one line a shopper reads once (FR-052).
 *
 * ⚠ THE COUNTS ONLY. Every omission is still accounted for — the *reason* goes to the row it concerns
 * (see [SavedRow]'s `skipNote`), which is where it can be acted on. A toast listing three product
 * names is a toast nobody finishes reading, and the previous block that did list them held permanent
 * space at the top of the screen for a transient result.
 *
 * ⚠ "None" is stated plainly rather than dressed up as success. "0 items added to your cart" was
 * literally true and read as a bug; if nothing went in, the sentence says so.
 */
private fun bulkSummary(outcome: SavedAddToCartOutcome): String {
    val added = outcome.added.size
    val skipped = outcome.skipped.size
    val addedPart = when (added) {
        0 -> "Nothing could be added to your cart"
        1 -> "1 item added to your cart"
        else -> "$added items added to your cart"
    }
    return when (skipped) {
        0 -> "$addedPart."
        1 -> "$addedPart · 1 couldn't be added — see the note on it."
        else -> "$addedPart · $skipped couldn't be added — see the notes on them."
    }
}

/**
 * ⚠ A skip reason is either one of the verdicts — so the bulk add and the list can never explain the
 * same item differently — or one of the CART's own refusals, which mean different things and must not
 * be flattened into "couldn't add". Mirrors `saved-display.ts` / `SavedList.tsx` on the web.
 */
private fun skipReason(reason: String): String = when (reason) {
    "cart_full" -> "your cart is full"
    "not_found" -> "no longer available"
    "temporarily_unavailable" -> "out of stock right now"
    "no_longer_sold" -> "no longer sold"
    else -> "couldn't be added right now"
}

/** How many placeholder rows a loading list reserves — roughly one phone's worth. */
private const val SkeletonRowCount = 6

/** The loading placeholder, built from the SAME row geometry so the content does not jump into it. */
@Composable
private fun SavedRowSkeleton() {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = EffySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
    ) {
        EffySkeletonBlock(modifier = Modifier.size(72.dp))
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(EffySpacing.s),
        ) {
            EffySkeletonBlock(modifier = Modifier.fillMaxWidth().height(16.dp))
            EffySkeletonBlock(modifier = Modifier.fillMaxWidth(0.5f).height(14.dp))
        }
    }
}

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
