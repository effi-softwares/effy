package com.effyshopping.customer.mobile.core.delivery

import com.effyshopping.customer.mobile.commerce.contract.CoverageKind
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class CoverageWordsTest {
    @Test
    fun everyWireValueMapsToItsOwnAnswer() {
        assertEquals(Coverage.Effy, CoverageKind.Effy.toCoverage())
        assertEquals(Coverage.Courier, CoverageKind.Courier.toCoverage())
        assertEquals(Coverage.None, CoverageKind.None.toCoverage())
        // A server older than 076 sends nothing: the app then shows nothing, not a guess.
        assertNull((null as CoverageKind?).toCoverage())
    }

    @Test
    fun anAddressIsDescribedByWhoDeliversOrByTheOneRefusal() {
        assertEquals("Delivered by Effy", CoverageWords.describe(Coverage.Effy))
        assertEquals("Courier delivery", CoverageWords.describe(Coverage.Courier))
        assertEquals(CoverageWords.REFUSAL, CoverageWords.describe(Coverage.None))
        assertNull(CoverageWords.describe(null))
    }
}
