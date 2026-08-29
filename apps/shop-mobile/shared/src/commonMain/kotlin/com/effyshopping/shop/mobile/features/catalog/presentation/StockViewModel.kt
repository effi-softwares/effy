package com.effyshopping.shop.mobile.features.catalog.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.shop.mobile.core.error.AppError
import com.effyshopping.shop.mobile.core.error.AppException
import com.effyshopping.shop.mobile.features.catalog.domain.AdjustStock
import com.effyshopping.shop.mobile.features.catalog.domain.GetProductStock
import com.effyshopping.shop.mobile.features.catalog.domain.ProductStock
import com.effyshopping.shop.mobile.features.catalog.domain.SetStockCount
import com.effyshopping.shop.mobile.features.catalog.domain.SetStockThreshold
import com.effyshopping.shop.mobile.features.catalog.domain.SetStockTracking
import com.effyshopping.shop.mobile.features.catalog.domain.StockMovement
import com.effyshopping.shop.mobile.features.catalog.domain.StockReason
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** How the count is being changed. Absolute and relative are different operations, not two spellings. */
enum class StockChangeMode { ADJUST, SET }

/**
 * ONE immutable, observable state object the view renders (MVVM, Principle VI). The view calls
 * functions; state flows down, events flow up.
 */
data class StockUiState(
    val productId: String = "",
    val stock: ProductStock? = null,
    val movements: List<StockMovement> = emptyList(),
    val isLoading: Boolean = true,
    val isSaving: Boolean = false,
    /** Copy for a refusal, already mapped — the view never interprets an error itself. */
    val message: String? = null,
    // ── Draft input ──
    val mode: StockChangeMode = StockChangeMode.ADJUST,
    val amount: String = "",
    val reason: StockReason = StockReason.RECEIVED,
    val openingCount: String = "",
    val thresholdInput: String = "",
) {
    val tracked: Boolean get() = stock?.tracked == true

    /**
     * ⚠ FR-003 IN THE UI, not only on the server. Turning tracking on without a count would make the
     * product instantly unbuyable with no operator intent behind it — a state the shop would hear
     * about from a customer rather than from their own action. The server refuses it and the database
     * makes it unrepresentable; this just stops the pointless round trip.
     */
    val canEnableTracking: Boolean get() = openingCount.toIntOrNull()?.let { it >= 0 } == true

    val canSubmitAmount: Boolean
        get() = amount.toIntOrNull()?.let { if (mode == StockChangeMode.SET) it >= 0 else it != 0 } == true
}

class StockViewModel(
    private val getProductStock: GetProductStock,
    private val setStockCount: SetStockCount,
    private val adjustStock: AdjustStock,
    private val setStockTracking: SetStockTracking,
    private val setStockThreshold: SetStockThreshold,
    private val coroutineScope: CoroutineScope? = null,
) : ViewModel() {
    private val mutableState = MutableStateFlow(StockUiState())
    val state = mutableState.asStateFlow()
    private val scope: CoroutineScope get() = coroutineScope ?: viewModelScope

    fun load(productId: String) {
        mutableState.update { it.copy(productId = productId, isLoading = true, message = null) }
        scope.launch { execute { getProductStock(productId) } }
    }

    fun setMode(mode: StockChangeMode) = mutableState.update { it.copy(mode = mode, message = null) }
    fun setAmount(value: String) = mutableState.update { it.copy(amount = value) }
    fun setReason(reason: StockReason) = mutableState.update { it.copy(reason = reason) }
    fun setOpeningCount(value: String) = mutableState.update { it.copy(openingCount = value) }
    fun setThresholdInput(value: String) = mutableState.update { it.copy(thresholdInput = value) }
    fun dismissMessage() = mutableState.update { it.copy(message = null) }

    fun enableTracking() {
        val s = mutableState.value
        val opening = s.openingCount.toIntOrNull() ?: return
        save { setStockTracking(s.productId, tracked = true, onHand = opening) }
    }

    fun disableTracking() {
        val s = mutableState.value
        save { setStockTracking(s.productId, tracked = false, onHand = null) }
    }

    fun submitAmount() {
        val s = mutableState.value
        val n = s.amount.toIntOrNull() ?: return
        save {
            when (s.mode) {
                StockChangeMode.SET -> setStockCount(s.productId, n, s.reason)
                StockChangeMode.ADJUST -> adjustStock(s.productId, n, s.reason)
            }
        }
    }

    /** Blank clears the product's own threshold, falling back to the shop default — not zero. */
    fun submitThreshold() {
        val s = mutableState.value
        val value = s.thresholdInput.trim().ifEmpty { null }?.toIntOrNull()
        if (s.thresholdInput.isNotBlank() && value == null) {
            mutableState.update { it.copy(message = "Enter a whole number, or leave it blank to use the shop default.") }
            return
        }
        save { setStockThreshold(s.productId, value) }
    }

    fun clearThreshold() {
        val s = mutableState.value
        mutableState.update { it.copy(thresholdInput = "") }
        save { setStockThreshold(s.productId, null) }
    }

    private fun save(block: suspend () -> com.effyshopping.shop.mobile.features.catalog.domain.ProductStockDetail) {
        mutableState.update { it.copy(isSaving = true, message = null) }
        scope.launch { execute(block) }
    }

    /**
     * ⚠ NAMED `execute`, NOT `run`. A private `run(block)` is shadowed by Kotlin's stdlib `run { }`
     * at any call site that passes a lambda literal: `run { getProductStock(id) }` silently resolves
     * to the stdlib, executes the block, discards the result and lets the exception escape. That is
     * exactly what the first draft did — `load()` never published anything and the screen sat empty
     * forever. Caught by StockViewModelTest, which is the only reason it is not in this file now.
     */
    private suspend fun execute(block: suspend () -> com.effyshopping.shop.mobile.features.catalog.domain.ProductStockDetail) {
        try {
            val detail = block()
            mutableState.update {
                it.copy(
                    stock = detail.stock,
                    movements = detail.movements,
                    isLoading = false,
                    isSaving = false,
                    amount = "",
                    openingCount = "",
                    thresholdInput = detail.stock.threshold?.toString() ?: "",
                )
            }
        } catch (e: AppException) {
            mutableState.update { it.copy(isLoading = false, isSaving = false, message = copyFor(e.error)) }
        }
    }
}

/**
 * ⚠ The view never sees an [AppError]. Mapping lives here so the same refusal reads the same way
 * wherever it is shown, and so a new error case is a compile error rather than a blank screen.
 *
 * `Forbidden` covers "another shop's product" too — the backend answers both with one code so the
 * route cannot be used to discover which product ids exist (FR-004). The copy must not out-guess it.
 */
internal fun copyFor(error: AppError): String = when (error) {
    is AppError.Validation -> "Check the value and try again — a whole number is required."
    AppError.Unauthenticated -> "Your session has expired. Sign in again."
    AppError.Forbidden -> "You don't have permission to change stock for this product."
    AppError.NotFound -> "That product no longer exists."
    AppError.Conflict -> "Stock is not being tracked for this product. Turn tracking on first."
    is AppError.RateLimited -> "Too many changes at once. Wait a moment and try again."
    AppError.Network -> "You appear to be offline. Check your connection and try again."
    AppError.Unavailable -> "The service is unreachable right now. Try again in a moment."
    AppError.Unexpected -> "Something went wrong. Please try again."
}
