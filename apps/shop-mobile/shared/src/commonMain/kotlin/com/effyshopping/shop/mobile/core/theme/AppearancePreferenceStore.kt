package com.effyshopping.shop.mobile.core.theme

import com.russhwolf.settings.Settings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

class AppearancePreferenceStore internal constructor(
    initialValue: String?,
    private val persist: (String) -> Unit,
) {
    constructor(settings: Settings) : this(
        initialValue = settings.getStringOrNull(STORAGE_KEY),
        persist = { settings.putString(STORAGE_KEY, it) },
    )

    private val mutableMode = MutableStateFlow(AppearanceMode.fromStorage(initialValue))
    val mode = mutableMode.asStateFlow()

    fun setMode(mode: AppearanceMode) {
        if (mutableMode.value == mode) return
        persist(mode.storageValue)
        mutableMode.value = mode
    }

    companion object {
        const val STORAGE_KEY = "appearance.mode"
    }
}
