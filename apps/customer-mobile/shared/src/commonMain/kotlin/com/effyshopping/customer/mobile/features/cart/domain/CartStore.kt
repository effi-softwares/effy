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
 * The cart mirror, the one thing the UI reads: an immutable, observable snapshot updated synchronously on
 * every action (a tap lands at once, the badge needs no round trip), persisted, and reconciled against the
 * platform.
 *  1. [adopt] only moves forward: a platform answer is taken only when its revision exceeds the
 *  mirror's, so a slow response to an old tap cannot resurrect a stale cart.
 *  2. Local edits never invent money: they recompute the item subtotal for display and drop any applied
 *  discount the platform has not re-approved.
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

    init {
        // A queue restored from disk has to show up in the snapshot immediately, or a change that survived
        // a force-quit would look saved until it was next touched.
        syncPendingIntoState()
    }

    /** Changes not yet accepted by the platform. Drained by the sync coordinator. */
    val queue: StateFlow<List<PendingChange>> = _queue.asStateFlow()

    private var persistJob: Job? = null

    // Local edits (applied to the mirror first, always)

    /** Add or increment a line locally. */
    fun add(line: GuestCartLine) = edit { it.copy(lines = addLine(it.lines, line)) }

    /** Set a line's quantity locally; 0 or less removes it. */
    fun setQuantity(variantId: String, quantity: Int) =
        edit { it.copy(lines = setLineQty(it.lines, variantId, quantity)) }

    /** Remove a line locally. */
    fun remove(variantId: String) = edit { it.copy(lines = removeLine(it.lines, variantId)) }

    /** Empty the payable cart locally. Set-aside items survive, exactly as on the platform. */
    fun clear() = edit { it.copy(lines = emptyList()) }

    /** The current cart, for a caller that needs a value rather than a stream (a merge payload). */
    fun snapshot(): CartSnapshot = _state.value

    // Reconciliation with the platform

    /**
     * Take the platform's cart — but only when it is newer than what we hold.
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
     * Take a re-priced guest cart. The preview answers with revision 0, which [adopt] would reject, but the
     * platform's prices and availability must still win, so this replaces the priced fields and keeps the
     * mirror's revision.
     */
    fun adoptPreview(priced: CartSnapshot): Boolean {
        val current = _state.value
        _state.value = priced.copy(revision = current.revision)
        persistSoon()
        return true
    }

    /** Back to an empty guest cart. Sign-out: the account's cart must not stay on the device. */
    fun reset() {
        _state.value = CartSnapshot()
        _queue.value = emptyList()
        persistJob?.cancel()
        local.clear()
    }

    // The pending queue (drained in US2/US4)

    fun enqueue(change: PendingChange) {
        _queue.value = _queue.value + change
        syncPendingIntoState()
        persistSoon()
    }

    /**
     * Queue a change, replacing any queued change of the same kind for the same line, so ten stepper taps
     * cost one request (safe because the payload is absolute). A change already in flight is left alone.
     */
    fun enqueueConflating(change: PendingChange) {
        val superseded = _queue.value.filterNot {
            it.status == PendingStatus.Queued && it.kind == change.kind && it.variantId == change.variantId
        }
        _queue.value = superseded + change
        syncPendingIntoState()
        persistSoon()
    }

    fun replaceQueue(changes: List<PendingChange>) {
        _queue.value = changes
        syncPendingIntoState()
        persistSoon()
    }

    fun dequeue(changeId: String) {
        _queue.value = _queue.value.filterNot { it.changeId == changeId }
        syncPendingIntoState()
        persistSoon()
    }

    /**
     * Mark a change the platform definitively refused. It stays in the queue — deliberately — because it
     * is the only record the shopper has that something they did did not stick. It is skipped by
     * the drain, so it costs nothing to keep, and [acknowledgeFailures] clears it once seen.
     */
    fun markFailed(changeId: String, reason: String) {
        _queue.value = _queue.value.map {
            if (it.changeId == changeId) it.copy(status = PendingStatus.Failed, failure = reason) else it
        }
        syncPendingIntoState()
        persistSoon()
    }

    /** The shopper has been told. Drop the dead changes. */
    fun acknowledgeFailures() {
        _queue.value = _queue.value.filterNot { it.isDead }
        syncPendingIntoState()
        persistSoon()
    }

    /**
     * Project the queue onto the snapshot the UI reads.
     *
     * The UI must have one source. Making the screen collect both the cart and the queue and combine them
     * would put that join in the presentation layer, where two screens would do it two different ways.
     */
    private fun syncPendingIntoState() {
        val q = _queue.value
        _state.value = _state.value.copy(
            pending = q.count { !it.isDead },
            failure = q.firstOrNull { it.isDead }?.failure,
        )
    }

    // Internals

    private inline fun edit(transform: (CartSnapshot) -> CartSnapshot) {
        _state.value = recompute(transform(_state.value))
        persistSoon()
    }

    /**
     * Recompute what a local edit can honestly know: the item subtotal, the grand total, and whether
     * checkout is worth offering. Everything else the platform owns.
     *
     * Unavailable lines are excluded from the subtotal here for the same reason the platform excludes them
     * — a shopper must never be shown a total that includes something they cannot buy.
     */
    private fun recompute(cart: CartSnapshot): CartSnapshot {
        val payable = cart.lines.filter { it.available }
        val subtotal = computeTotals(payable).itemSubtotal
        return cart.copy(
            itemSubtotalAmount = subtotal,
            // A discount the platform has not re-approved against this cart is a number we would be
            // inventing. Drop it and let the next platform response restore it.
            discount = null,
            promotions = emptyList(),
            promotionsNotApplied = emptyList(),
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
