package com.effyshopping.customer.mobile.features.cart.domain

import com.effyshopping.customer.mobile.features.cart.data.CartLocalStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The cart mirror — the ONE thing the UI reads (027).
 *
 * ── Why a mirror and not just "the cart" ────────────────────────────────────────────────────────
 *
 * For a signed-in shopper the platform is authoritative (research R0). But a tap must land immediately
 * (FR-014) and the badge must be right without a network round trip (FR-015), so the UI cannot read the
 * platform directly. It reads this: an immutable, observable snapshot that is updated synchronously on
 * every action, persisted, and then reconciled against the platform.
 *
 * Two rules keep the mirror honest, and they are the whole design:
 *
 *  1. **[adopt] only ever moves forward.** A platform response is taken ONLY when its revision exceeds
 *     what the mirror holds. Without that single comparison, a slow response to an old tap landing after a
 *     fast response to a new one would resurrect a stale cart — which is FR-009's failure mode arriving
 *     from the client side rather than from a second device.
 *  2. **Local edits never invent money the platform has not confirmed.** They recompute the item subtotal
 *     for display, and they DROP any applied discount, because a discount the platform has not re-approved
 *     against the changed cart is a number we would be making up (FR-042, research R10).
 *
 * MVVM (Principle VI): this is a domain-layer store exposing immutable state, not component state, and not
 * a hand-rolled cache of server data inside a ViewModel.
 *
 * ⚠ Replaces 019's `GuestCartStore`, which was an in-memory `MutableStateFlow` and nothing more.
 */
class CartStore(
    private val local: CartLocalStore,
    private val scope: CoroutineScope,
) {
    private val loaded = local.load()

    private val _state = MutableStateFlow(loaded?.cart ?: CartSnapshot())

    /** The cart, as the UI sees it. Hydrated from disk before the first frame — FR-001. */
    val state: StateFlow<CartSnapshot> = _state.asStateFlow()

    private val _queue = MutableStateFlow(loaded?.queue ?: emptyList())

    /** Changes not yet accepted by the platform. Drained by the sync coordinator (US2/US4). */
    val queue: StateFlow<List<PendingChange>> = _queue.asStateFlow()

    private var persistJob: Job? = null

    // ── Local edits (applied to the mirror first, always) ────────────────────────────────────────

    /** Add or increment a line locally. */
    fun add(line: GuestCartLine) = edit { it.copy(lines = addLine(it.lines, line)) }

    /** Set a line's quantity locally; 0 or less removes it. */
    fun setQuantity(productId: String, quantity: Int) =
        edit { it.copy(lines = setLineQty(it.lines, productId, quantity)) }

    /** Remove a line locally. */
    fun remove(productId: String) = edit { it.copy(lines = removeLine(it.lines, productId)) }

    /** Empty the payable cart locally. Set-aside items survive, exactly as on the platform (FR-030). */
    fun clear() = edit { it.copy(lines = emptyList()) }

    /** The current cart, for a caller that needs a value rather than a stream (a merge payload). */
    fun snapshot(): CartSnapshot = _state.value

    // ── Reconciliation with the platform ────────────────────────────────────────────────────────

    /**
     * Take the platform's cart — but ONLY when it is newer than what we hold.
     *
     * Returns true when adopted. A false is not an error: it is an out-of-order response being correctly
     * ignored, which is the entire reason `revision` exists.
     */
    fun adopt(snapshot: CartSnapshot): Boolean {
        if (snapshot.revision < _state.value.revision) return false
        _state.value = snapshot
        persistSoon()
        return true
    }

    /**
     * Take a re-priced GUEST cart. A guest has no server cart, so `POST /v1/cart/preview` answers with
     * revision 0 and [adopt]'s forward-only rule would reject it against any non-zero mirror. The
     * platform's prices and availability still have to win here — that is what makes FR-004 true for a
     * guest — so this replaces the priced fields and keeps the mirror's own revision.
     */
    fun adoptPreview(priced: CartSnapshot): Boolean {
        val current = _state.value
        _state.value = priced.copy(revision = current.revision)
        persistSoon()
        return true
    }

    /** Back to an empty guest cart. Sign-out: the account's cart must not stay on the device (FR-013). */
    fun reset() {
        _state.value = CartSnapshot()
        _queue.value = emptyList()
        persistJob?.cancel()
        local.clear()
    }

    // ── The pending queue (drained in US2/US4) ──────────────────────────────────────────────────

    fun enqueue(change: PendingChange) {
        _queue.value = _queue.value + change
        persistSoon()
    }

    fun replaceQueue(changes: List<PendingChange>) {
        _queue.value = changes
        persistSoon()
    }

    fun dequeue(changeId: String) {
        _queue.value = _queue.value.filterNot { it.changeId == changeId }
        persistSoon()
    }

    /**
     * Mark a change the platform definitively refused. It stays in the queue — deliberately — because it
     * is the only record the shopper has that something they did did not stick (FR-019). It is skipped by
     * the drain, so it costs nothing to keep, and [acknowledgeFailures] clears it once seen.
     */
    fun markFailed(changeId: String, reason: String) {
        _queue.value = _queue.value.map {
            if (it.changeId == changeId) it.copy(status = PendingStatus.Failed, failure = reason) else it
        }
        persistSoon()
    }

    /** The shopper has been told. Drop the dead changes. */
    fun acknowledgeFailures() {
        _queue.value = _queue.value.filterNot { it.isDead }
        persistSoon()
    }

    // ── Internals ───────────────────────────────────────────────────────────────────────────────

    private inline fun edit(transform: (CartSnapshot) -> CartSnapshot) {
        _state.value = recompute(transform(_state.value))
        persistSoon()
    }

    /**
     * Recompute what a local edit can honestly know: the item subtotal, the grand total, and whether
     * checkout is worth offering. Everything else the platform owns.
     *
     * Unavailable lines are excluded from the subtotal here for the same reason the platform excludes them
     * — a shopper must never be shown a total that includes something they cannot buy (FR-022).
     */
    private fun recompute(cart: CartSnapshot): CartSnapshot {
        val payable = cart.lines.filter { it.available }
        val subtotal = computeTotals(payable).itemSubtotal
        return cart.copy(
            itemSubtotalAmount = subtotal,
            // A discount the platform has not re-approved against THIS cart is a number we would be
            // inventing. Drop it and let the next platform response restore it (FR-042/FR-047).
            discount = null,
            discountAmount = "0.00",
            grandTotalAmount = subtotal,
            checkout = cart.checkout.copy(
                allowed = payable.isNotEmpty(),
                blockedReason = when {
                    cart.lines.isEmpty() -> CartBlockedReason.Empty
                    payable.isEmpty() -> CartBlockedReason.NoPayableItems
                    // A local edit cannot re-judge the minimum: it is the platform's number, and the
                    // platform re-answers on the next response. Leave whatever it last said.
                    else -> cart.checkout.blockedReason.takeIf { it == CartBlockedReason.BelowMinimum }
                },
            ),
        )
    }

    /**
     * Persist after a short quiet period rather than on every keystroke.
     *
     * `SharedPreferences` and `NSUserDefaults` both rewrite the whole file on commit, so ten rapid taps
     * on a quantity stepper would otherwise be ten whole-file writes. The delay is deliberately much
     * shorter than the network debounce: durability should be nearly immediate, because the process can die
     * at any moment, and that is the exact scenario this store exists for.
     */
    private fun persistSoon() {
        persistJob?.cancel()
        persistJob = scope.launch {
            delay(PERSIST_DEBOUNCE_MS)
            local.save(_state.value, _queue.value)
        }
    }

    private companion object {
        const val PERSIST_DEBOUNCE_MS = 150L
    }
}
