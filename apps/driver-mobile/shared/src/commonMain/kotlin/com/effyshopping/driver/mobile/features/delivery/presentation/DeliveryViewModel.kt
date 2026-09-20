package com.effyshopping.driver.mobile.features.delivery.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.core.presentation.userMessage
import com.effyshopping.driver.mobile.features.delivery.domain.AdvanceDrop
import com.effyshopping.driver.mobile.features.delivery.domain.CompleteContactless
import com.effyshopping.driver.mobile.features.delivery.domain.CompleteWithCode
import com.effyshopping.driver.mobile.features.delivery.domain.CompleteWithMedia
import com.effyshopping.driver.mobile.features.delivery.domain.ProofMethod
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryRun
import com.effyshopping.driver.mobile.features.delivery.domain.Drop
import com.effyshopping.driver.mobile.features.delivery.domain.FailDrop
import com.effyshopping.driver.mobile.features.delivery.domain.FailureReason
import com.effyshopping.driver.mobile.features.delivery.domain.GetDeliveryRun
import com.effyshopping.driver.mobile.features.delivery.domain.GetDrop
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Where a contactless package was left (060 FR-023).
 *
 * ⚠ Replaces free text, and that is a correctness change rather than styling: a typed answer
 * cannot be matched against a customer's later claim, and at a doorstep it mostly is not typed at
 * all. Serialised into the existing note field, so no contract changes.
 */
enum class DropSpot(val label: String) {
    FRONT_DOOR("Front door"),
    RECEPTION("Reception / lobby"),
    MAILROOM("Mailroom"),
    NEIGHBOUR("With a neighbour"),
}

data class DeliveryUiState(
    val run: DeliveryRun? = null,
    val drop: Drop? = null,
    val delivered: Boolean = false,
    val failed: Boolean = false,
    val isLoading: Boolean = false,
    val isWorking: Boolean = false,
    val message: String? = null,
    /**
     * A note attached to the proof (060 FR-022).
     *
     * ⚠ The repository has ALWAYS accepted a note on every proof method — and every call site in
     * the app passed `null`. This is a UI gap being closed, not a contract change.
     */
    val proofNote: String = "",
    /** A note attached to an undeliverable report (060 FR-022). Same story: the parameter existed. */
    val failNote: String = "",
    /** The chosen drop location for contactless proof (060 FR-023). */
    val dropSpot: DropSpot? = null,
)

class DeliveryViewModel(
    private val runId: String,
    private val getRun: GetDeliveryRun,
    private val getDrop: GetDrop,
    private val advanceDrop: AdvanceDrop,
    private val completeWithCode: CompleteWithCode,
    private val completeContactless: CompleteContactless,
    private val completeWithMedia: CompleteWithMedia,
    private val failDrop: FailDrop,
    private val newChangeId: () -> String,
) : ViewModel() {
    private val _state = MutableStateFlow(DeliveryUiState())
    val state = _state.asStateFlow()

    fun loadRun() {
        _state.update { it.copy(isLoading = true, message = null) }
        viewModelScope.launch {
            try {
                _state.update { it.copy(run = getRun(runId), isLoading = false) }
            } catch (e: AppException) {
                _state.update { it.copy(isLoading = false, message = e.error.userMessage()) }
            }
        }
    }

    fun loadDrop(dropId: String) {
        _state.update { it.copy(isLoading = true, drop = null, delivered = false, failed = false, message = null) }
        viewModelScope.launch {
            try {
                _state.update { it.copy(drop = getDrop(dropId), isLoading = false) }
            } catch (e: AppException) {
                _state.update { it.copy(isLoading = false, message = e.error.userMessage()) }
            }
        }
    }

    fun advance(dropId: String, to: String) {
        if (_state.value.isWorking) return
        _state.update { it.copy(isWorking = true, message = null) }
        viewModelScope.launch {
            try {
                advanceDrop(dropId, to, newChangeId())
                _state.update { it.copy(isWorking = false) }
                loadDrop(dropId)
            } catch (e: AppException) {
                _state.update { it.copy(isWorking = false, message = e.error.userMessage()) }
            }
        }
    }

    fun deliverWithCode(dropId: String, code: String, note: String?) = complete {
        completeWithCode(dropId, code, note, newChangeId())
    }

    fun deliverContactless(dropId: String, note: String?) = complete {
        completeContactless(dropId, note, newChangeId())
    }

    fun deliverWithPhoto(dropId: String, bytes: ByteArray, note: String?) = complete {
        completeWithMedia(dropId, ProofMethod.PHOTO, bytes, note, newChangeId())
    }

    fun deliverWithSignature(dropId: String, bytes: ByteArray, note: String?) = complete {
        completeWithMedia(dropId, ProofMethod.SIGNATURE, bytes, note, newChangeId())
    }

    private fun complete(action: suspend () -> Unit) {
        if (_state.value.isWorking) return
        _state.update { it.copy(isWorking = true, message = null) }
        viewModelScope.launch {
            try {
                action()
                _state.update { it.copy(isWorking = false, delivered = true) }
            } catch (e: AppException) {
                _state.update { it.copy(isWorking = false, message = e.error.userMessage()) }
            }
        }
    }

    fun fail(dropId: String, reason: FailureReason, note: String?) {
        if (_state.value.isWorking) return
        _state.update { it.copy(isWorking = true, message = null) }
        viewModelScope.launch {
            try {
                failDrop(dropId, reason, note, newChangeId())
                _state.update { it.copy(isWorking = false, failed = true) }
            } catch (e: AppException) {
                _state.update { it.copy(isWorking = false, message = e.error.userMessage()) }
            }
        }
    }
}
