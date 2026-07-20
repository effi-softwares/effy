package com.effyshopping.shop.mobile.features.orders.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.shop.mobile.core.error.AppError
import com.effyshopping.shop.mobile.core.error.AppException
import com.effyshopping.shop.mobile.features.orders.domain.AdvanceFulfillment
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentDetail
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentSummary
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentTransition
import com.effyshopping.shop.mobile.features.orders.domain.GetFulfillment
import com.effyshopping.shop.mobile.features.orders.domain.ItemProgress
import com.effyshopping.shop.mobile.features.orders.domain.ListFulfillments
import com.effyshopping.shop.mobile.features.orders.domain.QueueState
import com.effyshopping.shop.mobile.features.orders.domain.RecordItemProgress
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * How often the queue re-reads itself while the Orders screen is on screen (FR-004, SC-001: a newly placed
 * order must be visible within 30s without the operator navigating away and back). The loop lives in the
 * composition ([OrdersRoute]) so it is bound to the screen's lifetime and cannot keep polling in the
 * background — a tablet left on the counter must not hold the backend open all shift.
 */
const val QueueRefreshIntervalMillis: Long = 15_000L

/**
 * Everything the Orders screen renders, in ONE immutable snapshot. Failures reach the UI as a user-facing
 * [message] — never an exception, never an error code, never raw HTTP text.
 */
data class OrdersUiState(
    val queue: QueueState = QueueState.ACTIVE,
    val orders: List<FulfillmentSummary> = emptyList(),
    val selectedId: String? = null,
    val detail: FulfillmentDetail? = null,
    val isLoadingQueue: Boolean = true,
    val isLoadingDetail: Boolean = false,
    val isWorking: Boolean = false,
    val message: String? = null,
) {
    /** A genuine "nothing waiting" — distinct from "still loading" and from "it broke" (FR-005). */
    val isEmpty: Boolean get() = orders.isEmpty() && !isLoadingQueue && message == null

    /** Slipping work, counted for the header. It escalates in place; it never reorders the queue (FR-001a). */
    val atRiskCount: Int get() = orders.count { it.atRisk }

    /** No action may be offered while one is already in flight — that is how a double-apply starts. */
    val isBusy: Boolean get() = isWorking || isLoadingDetail

    /** Item controls exist only while the portion is being picked; a collected portion is immutable. */
    val canPickItems: Boolean get() = detail?.status?.isPickable == true && !isBusy
}

/**
 * The Orders ViewModel (020 US1–US4) — MVVM per constitution v1.8.0: immutable observable state out,
 * functions in, no navigation and no formatting decisions of its own.
 *
 * Two behaviours here are requirements rather than preferences:
 *
 * 1. **The queue is never re-sorted client-side.** The backend orders by delivery promise, tie-broken by
 *    arrival (FR-001); both keys are immutable, which is exactly why the queue is allowed to refresh under
 *    the operator's hands without work jumping around.
 * 2. **No portion is ever opened speculatively.** Reading a portion acknowledges it (FR-011a), so there is
 *    deliberately no auto-select-the-first-row convenience: only [selectOrder], driven by a human tap (or an
 *    [initialOrderId] restored from a nav route the human pushed), may load a detail.
 */
class OrdersViewModel(
    private val listFulfillments: ListFulfillments,
    private val getFulfillment: GetFulfillment,
    private val advanceFulfillment: AdvanceFulfillment,
    private val recordItemProgress: RecordItemProgress,
    private val initialOrderId: String? = null,
    private val coroutineScope: CoroutineScope? = null,
) : ViewModel() {
    private val mutableState = MutableStateFlow(OrdersUiState())
    val state = mutableState.asStateFlow()
    private val scope: CoroutineScope get() = coroutineScope ?: viewModelScope

    init {
        refresh()
        initialOrderId?.let(::selectOrder)
    }

    /** A visible reload — the operator asked, so show them it is happening. */
    fun refresh() {
        mutableState.update { it.copy(isLoadingQueue = true, message = null) }
        scope.launch { loadQueue() }
    }

    /** The background heartbeat (FR-004). Silent: no spinner, and a blip never wipes the queue on screen. */
    fun refreshQueue() {
        scope.launch { loadQueue(silent = true) }
    }

    /** Switch between live work and completed history (FR-016). Clears the selection — different list. */
    fun selectQueue(queue: QueueState) {
        if (queue == mutableState.value.queue) return
        mutableState.update {
            it.copy(queue = queue, orders = emptyList(), selectedId = null, detail = null, isLoadingQueue = true, message = null)
        }
        scope.launch { loadQueue() }
    }

    /**
     * Open a portion — a DELIBERATE act. This is the call that acknowledges a `pending` portion (FR-011a),
     * which is why nothing else in this class invokes it.
     */
    fun selectOrder(id: String) {
        if (id == mutableState.value.selectedId && mutableState.value.detail?.id == id) return
        mutableState.update { it.copy(selectedId = id, detail = null, isLoadingDetail = true, message = null) }
        scope.launch { loadDetail(id) }
    }

    /** Back to the queue (compact layouts) — the portion keeps whatever state it reached. */
    fun clearSelection() {
        mutableState.update { it.copy(selectedId = null, detail = null, isLoadingDetail = false, message = null) }
    }

    /**
     * Advance the portion, or reverse it back to picking — the ONE permitted reversal (FR-011d), requested by
     * asking for [FulfillmentTransition.PICKING] again.
     */
    fun requestTransition(to: FulfillmentTransition) {
        val id = mutableState.value.detail?.id ?: return
        if (mutableState.value.isBusy) return
        mutableState.update { it.copy(isWorking = true, message = null) }
        scope.launch {
            runCatching { advanceFulfillment(id, to) }.fold(
                onSuccess = { detail ->
                    mutableState.update { it.copy(detail = detail, selectedId = detail.id, isWorking = false) }
                    // A transition can move the portion between the active and completed slices — re-read the
                    // queue so the row the operator just changed is not left stale beside it.
                    loadQueue(silent = true)
                },
                onFailure = { failure -> handleFailure(failure, id, "That change didn't go through. Try again.") },
            )
        }
    }

    /**
     * Record ABSOLUTE quantities for one line (FR-010a). Passing `unavailableQuantity = 0` is how an item is
     * UN-FLAGGED once it turns up (FR-010d) — the same call, not a special undo path.
     */
    fun recordProgress(orderItemId: String, gatheredQuantity: Int? = null, unavailableQuantity: Int? = null) {
        val id = mutableState.value.detail?.id ?: return
        if (mutableState.value.isBusy) return
        mutableState.update { it.copy(isWorking = true, message = null) }
        scope.launch {
            runCatching {
                recordItemProgress(id, orderItemId, ItemProgress(gatheredQuantity, unavailableQuantity))
            }.fold(
                onSuccess = { detail ->
                    mutableState.update { it.copy(detail = detail, isWorking = false) }
                    loadQueue(silent = true)
                },
                onFailure = { failure -> handleFailure(failure, id, "That item couldn't be updated. Try again.") },
            )
        }
    }

    fun dismissMessage() {
        mutableState.update { it.copy(message = null) }
    }

    // ── internals ──────────────────────────────────────────────────────────────────────────────────

    private suspend fun loadQueue(silent: Boolean = false) {
        val queue = mutableState.value.queue
        runCatching { listFulfillments(queue) }.fold(
            onSuccess = { orders ->
                // Assigned in backend order, never re-sorted (FR-001).
                mutableState.update { it.copy(orders = orders, isLoadingQueue = false) }
            },
            onFailure = { failure ->
                // A failed heartbeat must not blank a queue the operator is reading from; only a visible
                // reload is allowed to report that the list itself could not be loaded.
                mutableState.update {
                    it.copy(
                        isLoadingQueue = false,
                        message = if (silent) it.message else failure.toMessage("Orders could not be loaded. Try again."),
                    )
                }
            },
        )
    }

    private suspend fun loadDetail(id: String) {
        runCatching { getFulfillment(id) }.fold(
            onSuccess = { detail ->
                mutableState.update { it.copy(detail = detail, selectedId = detail.id, isLoadingDetail = false) }
            },
            onFailure = { failure ->
                mutableState.update {
                    it.copy(isLoadingDetail = false, message = failure.toMessage("This order could not be opened."))
                }
            },
        )
    }

    /**
     * A 409 means the portion moved under this operator — a colleague advanced it, or it was collected. Say so
     * plainly and RE-READ the truth. Never retry: retrying a rejected transition is how you double-apply one.
     */
    private suspend fun handleFailure(failure: Throwable, id: String, fallback: String) {
        val conflict = (failure as? AppException)?.error == AppError.Conflict
        mutableState.update {
            it.copy(isWorking = false, isLoadingDetail = false, message = failure.toMessage(fallback))
        }
        if (conflict) {
            loadDetail(id)
            loadQueue(silent = true)
        }
    }
}

/**
 * The closed [AppError] set rendered as something a person standing at a shelf can act on. No status codes, no
 * internal detail, and — for the uniform 403 — no hint as to which term of the check refused (FR-020).
 */
private fun Throwable.toMessage(fallback: String): String = when (val error = (this as? AppException)?.error) {
    AppError.Conflict -> "This order was just updated by someone else — showing the latest."
    AppError.Forbidden -> "This order isn't available to you."
    AppError.Unauthenticated -> "Your session has expired. Sign in again."
    AppError.Network -> "No connection. Check the network and try again."
    AppError.Unavailable -> "Orders are temporarily unavailable. Try again shortly."
    is AppError.Validation -> error.message
    is AppError.RateLimited -> "Too many changes at once. Wait a moment and try again."
    else -> fallback
}
