package com.effyshopping.customer.mobile.features.saved.presentation

import com.effyshopping.customer.mobile.core.presentation.UnitPriceText
import com.effyshopping.customer.mobile.core.presentation.EffySnackbarHost
import com.effyshopping.customer.mobile.resources.lucide_heart
import com.effyshopping.customer.mobile.resources.lucide_trash_2
import com.effyshopping.customer.mobile.core.theme.EffyRoles
import com.effyshopping.customer.mobile.core.presentation.EffyIconButton
import com.effyshopping.customer.mobile.core.presentation.EffyInlineError
import com.effyshopping.customer.mobile.core.presentation.EffyTextLink
import com.effyshopping.customer.mobile.features.saved.domain.DEFAULT_LIST_ID
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
import com.effyshopping.mobile.kit.ui.EffyPullToRefresh
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
import com.effyshopping.mobile.design.EffyRadius
import com.effyshopping.mobile.design.EffySpacing
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.painterResource
import com.effyshopping.customer.mobile.core.presentation.EffyChip
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.SpanStyle
import androidx.compose.foundation.horizontalScroll

/**
 * Saved items: a vertical list built from the cart's primitives, not a product grid. This screen answers
 * "what changed, and can I buy it yet?", and every part of that is text (the price now, the price when
 * saved, one sentence per verdict), which a full-width row holds and a half-width tile wraps. The same as
 * customer-web's saved list.
 *
 * Pull to refresh works in every state: loading is a column of skeleton rows, and the empty and error states
 * scroll inside a centred column (`fillMaxSize` + `Arrangement.Center`).
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
            loadLists = container.loadLists,
            removeFromList = container.removeFromList,
            addToList = container.addToList,
            createList = container.createList,
            renameList = container.renameList,
            deleteList = container.deleteList,
        )
    }
    val state by vm.state.collectAsState()
    // Every list the shopper has, and the one on screen. `lists` is empty for a guest, and the
    // screen is then exactly the single saved list it was before lists existed.
    val lists by vm.lists.collectAsState()
    val selectedId by vm.selected.collectAsState()
    val selectedList = lists.firstOrNull { it.id == selectedId }
    val isDefault = selectedId == DEFAULT_LIST_ID
    var chooserFor by remember { mutableStateOf<String?>(null) }
    var naming by remember { mutableStateOf<Naming?>(null) }
    var deleting by remember { mutableStateOf(false) }
    val pendingUndo by vm.undo.collectAsState()
    // What is already in the cart, read from the cart's own mirror - never a second copy.
    //
    // An item stays on the list after being added: this is a watchlist, and the save-time
    // price it is watching against would be destroyed by consuming the entry. eBay's watchlist behaves
    // the same way, and the constitution names eBay as this capability's reference.
    //
    // But a row that keeps saying "Add to cart" when the thing is already in the cart invites the
    // shopper to tap again - and a second tap does not no-op, it increments the quantity. So the row
    // says where the item is and offers the way there, which is eBay's answer to the same problem.
    val cart by container.cart.state.collectAsState()
    val inCart = cart.lines.associate { it.productId to it.quantity }
    val snackbarHost = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    // Client-side. The set is capped at 200 and already in memory, so a round trip per
    // sort would be latency the shopper feels on a control that should be instant.
    var order by remember { mutableStateOf(SavedOrder.RECENT) }
    var bulk by remember { mutableStateOf<SavedAddToCartOutcome?>(null) }
    var bulkBusy by remember { mutableStateOf(false) }

    // The mirror is re-checked on arrival, because this screen now renders from it. A cart filled on
    // another device would otherwise leave every row offering "Add to cart" for something already in
    // there - which is the defect this whole feature exists to remove, one list over. A failure changes
    // nothing: the mirror stays and the rows degrade to "Add to cart", never to a false "in your cart".
    LaunchedEffect(Unit) { runCatching { container.syncCart() } }

    /**
     * Removal offers undo, and the item comes back in the position it held.
     *
     * The ViewModel has published this since the slice was built and nothing rendered it, so a
     * mis-tap on the list was unrecoverable - the same one-tap mistake the cart's own undo exists to
     * forgive.
     */
    LaunchedEffect(pendingUndo) {
        val undo = pendingUndo ?: return@LaunchedEffect
        val result = snackbarHost.showSnackbar(
            message = if (undo.listId == DEFAULT_LIST_ID) "Removed ${undo.item.name}"
            else "Removed ${undo.item.name} from this list",
            actionLabel = "Undo", // at most one action
            duration = SnackbarDuration.Short,
        )
        if (result == SnackbarResult.ActionPerformed) vm.undoRemoval() else vm.dismissUndo()
    }

    /**
     * Add one saved item to the cart.
     *
     * It stays on the list. A watchlist entry is not consumed by being bought - the whole
     * point is to keep watching what it costs.
     */
    fun addOne(item: SavedItem) {
        // No remembered size on a product sold in several: the row offers "Choose size" instead.
        val variantId = item.variantId ?: return onOpen(item.productId)
        container.addToCart(
            GuestCartLine(
                variantId = variantId,
                productId = item.productId,
                name = item.name,
                variantLabel = item.variantLabel,
                unitPrice = item.unitPrice,
                imageUrl = item.imageUrl,
                unitPriceAmount = item.priceAmount,
                currency = item.currency,
                quantity = 1,
                // The saved-item contract carries no package token - it is captured at add time from
                // a storefront read, and this list is not one. A blank key degrades to a single
                // anonymous package, which the platform re-decides on the next re-price.
            ),
        )
        scope.launch { snackbarHost.showSnackbar("${item.name} added to your cart") }
    }

    /**
     * Add everything purchasable in one action. The server decides what goes in. The count is a toast, and
     * each item left out says why on its own row ([bulkSkips]); nothing is omitted silently.
     */
    fun addAll() {
        if (bulkBusy) return
        bulkBusy = true
        scope.launch {
            try {
                // The list on screen, and only it. Nothing from another list goes in.
                val outcome = container.addAllSavedToCart(listId = selectedId, changeId = newUuid())
                bulk = outcome
                // The platform wrote to the account cart; the local mirror has not heard about it yet.
                container.syncCart()
                snackbarHost.showSnackbar(bulkSummary(outcome))
            } catch (_: Throwable) {
                // Transient - the cart is unchanged and the shopper can try again.
                snackbarHost.showSnackbar("We couldn't add those just now. Please try again.")
            } finally {
                bulkBusy = false
            }
        }
    }

    // The snackbar is an overlay at the bottom, not a row in the column.
    //
    // As a column child it reserved layout space at the TOP of the screen and shoved the content down
    // whenever it appeared - which is a banner, not a toast. Over the bottom of the screen it covers
    // the action bar for a few seconds and takes nothing away permanently, which is the whole point of
    // a transient message.
    Box(modifier = Modifier.fillMaxSize()) {
    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = "Saved items", onBack = onBack)
        // Named lists need an account; `lists` is empty for a guest, so this is not offered. 087: a
        // header holds only title, Back and the bell, so "New list" moved into the page.
        if (lists.isNotEmpty()) {
            Row(modifier = Modifier.fillMaxWidth().padding(horizontal = EffySpacing.xs), horizontalArrangement = Arrangement.End) {
                EffyTextLink("New list", onClick = { naming = Naming.New })
            }
        }
        if (lists.size > 1 || !isDefault) {
            SavedListsBar(
                lists = lists,
                selectedId = selectedId,
                onSelect = {
                    bulk = null // the skip notes belong to the list they were about
                    vm.select(it)
                },
                onRename = { naming = Naming.Rename },
                onDelete = { deleting = true },
            )
        }

        when (val s = state) {
            // A content-shaped skeleton, not an empty box. The old loading state rendered a bare
            // `Column {}` inside the refresh container - nothing to scroll, so the gesture it was
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
                        icon = Res.drawable.lucide_heart,
                        actionLabel = "Try again",
                        onAction = vm::retry,
                    )
                }
            }

            is SavedUiState.Ready -> when {
                // One empty state: the shopper has saved nothing. Items that cannot come to this address
                // still render, each with its own verdict.
                s.items.isEmpty() -> EffyPullToRefresh(
                    onRefresh = { vm.refresh() },
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.Center,
                    ) {
                        if (isDefault) {
                            EffyEmptyState(
                                title = "Nothing saved yet",
                                // Guest saves are device-held, and saying so is the difference
                                // between a deliberate design and an apparent bug when they sign in on
                                // another phone.
                                body = "Tap the heart on anything you want to keep an eye on. " +
                                    "We'll tell you when the price drops or it comes back in stock. " +
                                    "Saved before signing in? Those stay on this device until you sign in.",
                                icon = Res.drawable.lucide_heart,
                                actionLabel = "Start shopping",
                                onAction = onBrowse,
                            )
                        } else {
                            // A different message. "Nothing saved yet" on an empty
                            // named list would tell a shopper with a full "Saved" list that they
                            // had lost everything.
                            EffyEmptyState(
                                title = "This list is empty",
                                body = "Open any product and choose Add to list to put it here.",
                                icon = Res.drawable.lucide_heart,
                                actionLabel = "Browse products",
                                onAction = onBrowse,
                            )
                        }
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
                            // 087 (Saved board) - "12 items · 3 dropped in price": what is here, and the
                            // one thing worth coming back for, in green.
                            item(key = "summary") {
                                val dropped = s.items.count { it.priceDropped }
                                Text(
                                    buildAnnotatedString {
                                        append("${s.items.size} item${if (s.items.size == 1) "" else "s"}")
                                        if (dropped > 0) {
                                            append(" · ")
                                            withStyle(SpanStyle(color = EffyRoles.brand, fontWeight = FontWeight.SemiBold)) {
                                                append("$dropped dropped in price")
                                            }
                                        }
                                    },
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(top = EffySpacing.s),
                                )
                            }
                            // Only shown when there is enough to sort. A control over three items is
                            // noise. It scrolls with the list - unlike the bulk action below, it is not
                            // worth permanent space. Chips, as the board draws them.
                            if (s.items.size > 3) {
                                item(key = "sort") {
                                    Row(
                                        modifier = Modifier.padding(vertical = EffySpacing.s).horizontalScroll(rememberScrollState()),
                                        horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
                                    ) {
                                        SavedOrder.entries.forEach { o ->
                                            EffyChip(o.label, selected = order == o, onClick = { order = o })
                                        }
                                    }
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
                                    removeLabel = if (isDefault) "Remove ${item.name} from saved items"
                                    else "Remove ${item.name} from this list",
                                    // Named lists need an account; a guest's row has no chooser.
                                    onAddToList = if (lists.isEmpty()) null else {
                                        { chooserFor = item.productId }
                                    },
                                )
                                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                            }
                        }
                    }

                    // The one committing action, pinned within the thumb's reach like the cart's checkout bar.
                    if (anyPurchasable) {
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                        Column(modifier = Modifier.padding(EffySpacing.lg)) {
                            // The bar answers the same question the rows do. When everything
                            // available is already in the cart, "Add everything available to cart" is
                            // an invitation to buy two of each - the bulk add is not idempotent across
                            // taps (each tap is a new batch; only a retry of one batch is deduped). So
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

        EffySnackbarHost(snackbarHost, modifier = Modifier.align(Alignment.BottomCenter))
    }

    chooserFor?.let { productId ->
        ListChooserSheet(
            container = container,
            productId = productId,
            onDismiss = {
                chooserFor = null
                // The chooser can take a product out of the very list on screen.
                vm.onChooserClosed()
            },
        )
    }

    when (naming) {
        Naming.New -> ListNameDialog(
            title = "New list",
            confirmLabel = "Create",
            initial = "",
            onSubmit = vm::createList,
            onDismiss = { naming = null },
        )
        Naming.Rename -> ListNameDialog(
            title = "Rename list",
            confirmLabel = "Save",
            initial = selectedList?.name.orEmpty(),
            onSubmit = vm::renameSelected,
            onDismiss = { naming = null },
        )
        null -> Unit
    }

    if (deleting && selectedList != null && !selectedList.isDefault) {
        DeleteListDialog(
            list = selectedList,
            onConfirm = vm::deleteSelected,
            onDismiss = { deleting = false },
        )
    }
}

/** Which name dialog is open on the saved screen. */
private enum class Naming { New, Rename }

/**
 * One saved item - the cart row's composition, carrying the watchlist's own facts.
 *
 * Two stacked rows, for the reason `CartRow` records: controls sharing a row with a two-line
 * product name get whatever width is left after a thumbnail and a price, which on a phone is not
 * enough, and Compose then squeezes the labels into wrapped nonsense. The actions get their own
 * full-width line.
 */
@Composable
private fun SavedRow(
    item: SavedItem,
    /**
     * Why the last bulk add left this item out, or null.
     *
     * It belongs here rather than in a report above the list. "SunRice Premium Long Grain White Rice
     * 1kg - couldn't be added right now" printed at the top of the screen makes the shopper match a
     * name to a row; on the row it names nothing and simply says what happened.
     */
    skipNote: String?,
    /** How many of this product are already in the cart - 0 when none. */
    cartQuantity: Int,
    onOpen: (String) -> Unit,
    onAddToCart: () -> Unit,
    onGoToCart: () -> Unit,
    onRemove: () -> Unit,
    removeLabel: String,
    onAddToList: (() -> Unit)?,
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
                // The size remembered with the save.
                item.variantLabel?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }

                // One distinct sentence per outcome ("out of stock": wait; "no longer sold": give up); the
                // words carry the meaning.
                val note = when (item.verdict) {
                    SavedVerdict.PURCHASABLE -> null
                    SavedVerdict.TEMPORARILY_UNAVAILABLE -> "Out of stock right now"
                    SavedVerdict.NO_LONGER_SOLD -> "No longer sold"
                }
                if (note != null) EffyInlineError(note)

                // The bulk add's own refusal, which is not the same thing as the verdict above. An
                // item can be perfectly purchasable and still be turned away by the cart - because the
                // cart is full, say - and flattening the two would tell the shopper the product is
                // unavailable when it is their cart that is.
                if (skipNote != null) EffyInlineError("Not added - $skipNote")
            }

            Column(horizontalAlignment = Alignment.End) {
                Text(
                    money(item.priceAmount, item.currency),
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                )
                UnitPriceText(item.unitPrice)
                // The watchlist's whole reason for existing: what changed since it was saved. There
                // is deliberately no equivalent for a rise - the current price is always
                // shown, so nothing is concealed, but a rise is not something a shopper can act on.
                if (item.priceDropped) {
                    // A price drop is a saving: said in Effy green.
                    Text("Price dropped", style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold), color = EffyRoles.brand)
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
            // Offered only when the platform says the item is purchasable. Once it is in the cart, the row
            // says so and links there (the item stays on this list, and `addLine` increments, so a second
            // "Add to cart" would add two). No stepper: quantity is the cart's business.
            when {
                !item.verdict.isPurchasable -> Unit
                // The count is stated: "in your cart" is not the same fact as "two of these are".
                cartQuantity > 0 -> EffyTextLink(if (cartQuantity == 1) "In your cart · View" else "$cartQuantity in your cart · View", onClick = onGoToCart)
                // Sold in several sizes and none remembered: the shopper chooses (never a guess).
                item.variantId == null -> EffyTextLink("Choose size", onClick = { onOpen(item.productId) })
                else -> EffyTextLink("Add to cart", onClick = onAddToCart)
            }
            Spacer(Modifier.weight(1f))
            // The labelled way into the list chooser from a row.
            if (onAddToList != null) EffyTextLink("Add to list", onClick = onAddToList)
            // The cart's destructive icon, in the cart's error tint - one visual language for "this
            // takes the thing away", both places it can happen. Removal is undoable.
            // Black, not red (the storefront has no red); removal is undoable.
            EffyIconButton(Res.drawable.lucide_trash_2, contentDescription = removeLabel, onClick = onRemove)
        }
    }
}

/**
 * What a bulk add did, in one line a shopper reads once.
 *
 * The counts only. Every omission is still accounted for - the *reason* goes to the row it concerns
 * (see [SavedRow]'s `skipNote`), which is where it can be acted on. A toast listing three product
 * names is a toast nobody finishes reading, and the previous block that did list them held permanent
 * space at the top of the screen for a transient result.
 *
 * "None" is stated plainly rather than dressed up as success. "0 items added to your cart" was
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
        1 -> "$addedPart · 1 couldn't be added - see the note on it."
        else -> "$addedPart · $skipped couldn't be added - see the notes on them."
    }
}

/**
 * A skip reason is either one of the verdicts - so the bulk add and the list can never explain the
 * same item differently - or one of the cart's own refusals, which mean different things and must not
 * be flattened into "couldn't add". Mirrors `saved-display.ts` / `SavedList.tsx` on the web.
 */
private fun skipReason(reason: String): String = when (reason) {
    "cart_full" -> "your cart is full"
    "not_found" -> "no longer available"
    "temporarily_unavailable" -> "out of stock right now"
    "no_longer_sold" -> "no longer sold"
    // Several sizes and none remembered.
    "choose_variant" -> "choose a size on its page"
    else -> "couldn't be added right now"
}

/** How many placeholder rows a loading list reserves - roughly one phone's worth. */
private const val SkeletonRowCount = 6

/** The loading placeholder, built from the same row geometry so the content does not jump into it. */
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

/** How the saved list is ordered. */
enum class SavedOrder(val label: String) {
    RECENT("Recently saved"),
    AVAILABLE("Available first"),
    AISLE("By aisle"),
}

/**
 * `sortedBy` returns a new list rather than sorting in place - the state list must not be mutated
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
