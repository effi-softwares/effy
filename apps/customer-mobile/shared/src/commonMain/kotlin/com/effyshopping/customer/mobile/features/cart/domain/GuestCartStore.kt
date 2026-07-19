package com.effyshopping.customer.mobile.features.cart.domain

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The observable device-local guest cart (019 US2). A single instance lives in the AppContainer, so the
 * cart badge and cart screen share one source of truth. In-memory for now (survives config change);
 * cross-restart persistence is a deferred enhancement (a multiplatform-settings swap), and the
 * authoritative cart once signed in is the SERVER cart (US3 merge).
 */
class GuestCartStore {
    private val _lines = MutableStateFlow<List<GuestCartLine>>(emptyList())
    val lines: StateFlow<List<GuestCartLine>> = _lines.asStateFlow()

    fun add(line: GuestCartLine) {
        _lines.value = addLine(_lines.value, line)
    }

    fun setQuantity(productId: String, quantity: Int) {
        _lines.value = setLineQty(_lines.value, productId, quantity)
    }

    fun remove(productId: String) {
        _lines.value = removeLine(_lines.value, productId)
    }

    fun snapshot(): List<GuestCartLine> = _lines.value

    fun clear() {
        _lines.value = emptyList()
    }
}
