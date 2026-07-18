package com.effyshopping.shop.mobile.core.platform

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class PlatformUiState(val reducedMotion: Boolean = false)

interface PlatformUiController {
    val state: StateFlow<PlatformUiState>
    fun applyAppearance(isDark: Boolean)
    fun dispose()
}

class NoOpPlatformUiController : PlatformUiController {
    private val mutableState = MutableStateFlow(PlatformUiState())
    override val state: StateFlow<PlatformUiState> = mutableState.asStateFlow()
    override fun applyAppearance(isDark: Boolean) = Unit
    override fun dispose() = Unit
}
