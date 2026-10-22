package com.effyshopping.customer.mobile.features.catalog

import com.effyshopping.customer.mobile.features.catalog.domain.SelectorValue
import com.effyshopping.customer.mobile.features.catalog.domain.ValueState
import com.effyshopping.customer.mobile.features.catalog.domain.Variant
import com.effyshopping.customer.mobile.features.catalog.domain.VariantOption
import com.effyshopping.customer.mobile.features.catalog.domain.VariantOptionValue
import com.effyshopping.customer.mobile.features.catalog.domain.VariantSelection
import kotlin.test.Test
import kotlin.test.assertEquals

/** 098 — the same cases as the storefront's `lib/variant-selection.test.ts`. */
class VariantSelectionTest {
    private val options = listOf(
        VariantOption("o1", 1, "Size", listOf(VariantOptionValue("s5", "500 g", 0), VariantOptionValue("s1", "1 kg", 1))),
        VariantOption("o2", 2, "Type", listOf(VariantOptionValue("tw", "White", 0), VariantOptionValue("tb", "Brown", 1))),
    )

    private fun v(id: String, a: String, b: String, available: Boolean = true) =
        Variant(id, a to b, id, "1.00", null, null, available, null)

    // 500 g White, 500 g Brown (sold out), 1 kg White. No 1 kg Brown.
    private val variants = listOf(v("5w", "s5", "tw"), v("5b", "s5", "tb", available = false), v("1w", "s1", "tw"))

    @Test
    fun opensOnTheLinkedSizeWhenOnSaleElseTheDefault() {
        assertEquals("1w", VariantSelection.initialVariantId(variants, "5w", "1w"))
        assertEquals("5w", VariantSelection.initialVariantId(variants, "5w", "gone"))
        assertEquals("5w", VariantSelection.initialVariantId(variants, "5w", null))
    }

    @Test
    fun aSoldOutCombinationIsMarkedNotHidden() {
        assertEquals(ValueState.SoldOut, VariantSelection.valueState(variants, "s5" to "tw", 1, "tb"))
        assertEquals(ValueState.Available, VariantSelection.valueState(variants, "s5" to "tw", 0, "s1"))
        assertEquals(ValueState.SoldOut, VariantSelection.valueState(variants, "s1" to "tw", 1, "tb"))
    }

    @Test
    fun pickingKeepsTheOtherChoiceWhenSoldElseMovesToOneThatIs() {
        assertEquals("1w", VariantSelection.pickValue(variants, "s5" to "tw", 0, "s1")?.id)
        assertEquals("5b", VariantSelection.pickValue(variants, "s1" to "tw", 1, "tb")?.id)
        assertEquals("1w", VariantSelection.pickValue(variants, "s5" to "tb", 0, "s1")?.id)
    }

    @Test
    fun drawsEveryOptionInOrderWithStatesAndTheSelection() {
        val rows = VariantSelection.rows(options, variants, variants[0])
        assertEquals(listOf("Size", "Type"), rows.map { it.option.name })
        assertEquals(
            listOf(SelectorValue("tw", "White", ValueState.Available, true), SelectorValue("tb", "Brown", ValueState.SoldOut, false)),
            rows[1].values,
        )
    }
}
