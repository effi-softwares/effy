package com.effyshopping.customer.mobile.features.catalog.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.features.catalog.domain.GetPromotion
import com.effyshopping.customer.mobile.features.catalog.domain.Promotion
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface PromotionUiState {
    data object Loading : PromotionUiState
    data class Ready(val promotion: Promotion) : PromotionUiState

    /**
     * Two failures, kept apart on purpose, because they ask the shopper to do different things.
     *
     * [Unavailable] means the promotion is genuinely gone — expired, fully claimed, withdrawn. Offering
     * "Try again" there is a lie: retrying will fail forever, and the shopper is owed the truth so they
     * can stop waiting for a discount that is not coming. [Failed] is a transport or server problem,
     * where retrying is exactly the right advice.
     */
    data object Unavailable : PromotionUiState
    data object Failed : PromotionUiState
}

/** The promotion detail ViewModel. It loads the promotion rather than taking the banner's, so an offer that ended says so. */
class PromotionViewModel(
    private val promotionId: String,
    private val getPromotion: GetPromotion,
) : ViewModel() {

    private val _state = MutableStateFlow<PromotionUiState>(PromotionUiState.Loading)
    val state: StateFlow<PromotionUiState> = _state.asStateFlow()

    private val _justCopied = MutableStateFlow(false)
    val justCopied: StateFlow<Boolean> = _justCopied.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = PromotionUiState.Loading
            _state.value = read()
        }
    }

    /** Reload without clearing the screen — pull-to-refresh. A failure keeps what is already shown. */
    suspend fun refresh() {
        val next = read()
        // A transport blip must not replace a promotion the shopper is reading with an error screen.
        // Unavailable is different: it is a real answer about this promotion, and showing stale terms
        // after learning they are void would be the worse outcome.
        if (next !is PromotionUiState.Failed) _state.value = next
    }

    private suspend fun read(): PromotionUiState =
        try {
            PromotionUiState.Ready(getPromotion(promotionId))
        } catch (e: CancellationException) {
            throw e
        } catch (e: AppException) {
            // A promotion that no longer qualifies for display is served as 404 — the same answer as
            // an id that never existed. That is deliberate server-side: a distinguishable refusal would
            // let anyone enumerate the operator's private, unadvertised codes by id.
            if (e.error == AppError.NotFound) PromotionUiState.Unavailable else PromotionUiState.Failed
        } catch (_: Throwable) {
            PromotionUiState.Failed
        }

    /** Called by the View once it has actually put the code on the clipboard. */
    fun onCodeCopied() {
        viewModelScope.launch {
            _justCopied.value = true
            delay(2000)
            _justCopied.value = false
        }
    }
}
