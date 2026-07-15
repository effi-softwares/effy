package com.effyshopping.customer.mobile.core.presentation

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * MVVM as a strict, unidirectional state machine (constitution Principle VI; ARCHITECTURE.md § Mobile).
 *
 * The View renders [uiState] (a single immutable object), sends user actions as typed [UiIntent]s via
 * [onIntent], and collects one-off [UiEffect]s (navigation, transient messages) that must fire exactly
 * once. State is mutated ONLY through [updateState] — never assigned directly, never mutated in place —
 * so every render is a pure function of an immutable snapshot.
 *
 * `androidx.lifecycle.ViewModel` is multiplatform (lifecycle 2.8+, research §3.2), giving subclasses
 * `viewModelScope` in commonMain with no hand-rolled scope. On iOS there is no ViewModelStoreOwner, so
 * lifetime is managed at the host (a Compose NavDisplay, or — for a SwiftUI host later — a small
 * bridge); that is a wiring concern, not this contract's.
 */
abstract class BaseViewModel<UiState : Any, UiIntent : Any, UiEffect : Any>(
    initialState: UiState,
) : ViewModel() {

    private val _uiState = MutableStateFlow(initialState)
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    // extraBufferCapacity = 1 so an effect emitted with no active collector is not silently dropped.
    private val _effects = MutableSharedFlow<UiEffect>(extraBufferCapacity = 1)
    val effects: SharedFlow<UiEffect> = _effects.asSharedFlow()

    /** The single entry point for everything the user can do. Implementations reduce, then act. */
    abstract fun onIntent(intent: UiIntent)

    /** The ONLY way state changes: apply a pure reducer to the current immutable snapshot. */
    protected fun updateState(reducer: (UiState) -> UiState) = _uiState.update(reducer)

    /** Fire a one-off side effect (navigate, toast). Delivered once, to whoever is collecting. */
    protected suspend fun emitEffect(effect: UiEffect) = _effects.emit(effect)
}
