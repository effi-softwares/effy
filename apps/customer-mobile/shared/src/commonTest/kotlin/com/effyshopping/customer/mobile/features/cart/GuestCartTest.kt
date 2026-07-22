package com.effyshopping.customer.mobile.features.cart

import com.effyshopping.customer.mobile.features.cart.domain.GuestCartLine
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartStore
import com.effyshopping.customer.mobile.features.cart.domain.addLine
import com.effyshopping.customer.mobile.features.cart.domain.cartCount
import com.effyshopping.customer.mobile.features.cart.domain.packagesOf
import com.effyshopping.customer.mobile.features.cart.domain.removeLine
import com.effyshopping.customer.mobile.features.cart.domain.setLineQty
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class GuestCartTest {

    private fun line(id: String, qty: Int, pkg: String = "") = GuestCartLine(
        productId = id, name = id, imageUrl = null, unitPriceAmount = "5.00", currency = "AUD", quantity = qty, packageKey = pkg,
    )

    @Test
    fun addsNewLine() {
        assertEquals(1, addLine(emptyList(), line("a", 2)).size)
    }

    @Test
    fun mergesQuantityForSameProduct() {
        val result = addLine(listOf(line("a", 2)), line("a", 3))
        assertEquals(1, result.size)
        assertEquals(5, result.first().quantity)
    }

    @Test
    fun clampsMergedQuantityAt99() {
        assertEquals(99, addLine(listOf(line("a", 90)), line("a", 20)).first().quantity)
    }

    @Test
    fun clampsNewLineToAtLeastOne() {
        assertEquals(1, addLine(emptyList(), line("a", 0)).first().quantity)
    }

    @Test
    fun setQtyZeroRemovesLine() {
        assertEquals(0, setLineQty(listOf(line("a", 3)), "a", 0).size)
    }

    @Test
    fun setQtyUpdatesAndClamps() {
        assertEquals(99, setLineQty(listOf(line("a", 1)), "a", 200).first().quantity)
    }

    @Test
    fun removeDropsMatchingProduct() {
        val result = removeLine(listOf(line("a", 1), line("b", 1)), "a")
        assertEquals(listOf(line("b", 1)), result)
    }

    @Test
    fun countSumsQuantities() {
        assertEquals(5, cartCount(listOf(line("a", 2), line("b", 3))))
    }

    @Test
    fun groupsLinesByPackageKeyAnonymously() {
        val packages = packagesOf(listOf(line("a", 1, "pkg_x"), line("b", 1, "pkg_y"), line("c", 2, "pkg_x")))
        assertEquals(2, packages.size)
        // Stable first-appearance order; 1-based ordinals — the ONLY label (never a shop name/location).
        assertEquals(listOf(1, 2), packages.map { it.index })
        assertEquals(listOf("pkg_x", "pkg_y"), packages.map { it.packageKey })
        assertEquals(listOf("a", "c"), packages[0].lines.map { it.productId })
        assertEquals(listOf("b"), packages[1].lines.map { it.productId })
    }

    @Test
    fun blankPackageKeysCollapseToOnePackage() {
        // No token from the storefront read yet → one anonymous package (graceful single-part, SC-011).
        val packages = packagesOf(listOf(line("a", 1), line("b", 1)))
        assertEquals(1, packages.size)
        assertEquals(1, packages.first().index)
        assertEquals(2, packages.first().lines.size)
    }

    @Test
    fun packagesNeverExposeAnythingBeyondAnOrdinal() {
        val packages = packagesOf(listOf(line("a", 1, "pkg_secret_shop_42")))
        // The ordinal is derived, never the key; the key is opaque and never presented as identity.
        assertTrue(packages.first().index == 1)
    }

    @Test
    fun storeReflectsMutations() {
        val store = GuestCartStore()
        store.add(line("a", 2))
        store.add(line("a", 1)) // merges → 3
        store.add(line("b", 1))
        assertEquals(4, cartCount(store.snapshot()))
        store.setQuantity("a", 0) // removes a
        assertEquals(1, cartCount(store.snapshot()))
        store.clear()
        assertEquals(0, store.snapshot().size)
    }
}
