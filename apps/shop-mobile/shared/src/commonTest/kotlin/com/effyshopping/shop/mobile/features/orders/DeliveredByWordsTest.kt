package com.effyshopping.shop.mobile.features.orders

import com.effyshopping.shop.mobile.features.orders.domain.DeliveredBy
import com.effyshopping.shop.mobile.features.orders.domain.promiseLine
import com.effyshopping.shop.mobile.features.orders.domain.words
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

/**
 * 079 — a shop is told who takes the package away, in two words, and never the customer's word for
 * the delivery. (That the two words are the website's is held from the other side, by
 * `packages/shared-types/src/delivery-type.test.ts`, which reads `DeliveredByWords.kt`.)
 */
class DeliveredByWordsTest {
    @Test
    fun saysWhoTakesThePackageAndWhenItMustBeReady() {
        assertEquals("Effy driver · ready by 4:30 pm", promiseLine(DeliveredBy.EFFY_DRIVER, "4:30 pm"))
        assertEquals("Courier · ready by 4:30 pm", promiseLine(DeliveredBy.COURIER, "4:30 pm"))
    }

    @Test
    fun saysNothingAboutWhoWhenTheServerDidNot() {
        // A server older than 079 sends no `deliveredBy`. The line must not guess — and must not fall
        // back to the service level it used to print.
        assertEquals("Ready by 4:30 pm", promiseLine(null, "4:30 pm"))
    }

    @Test
    fun neverUsesTheCustomersWords() {
        val said = DeliveredBy.entries.map { it.words() } + DeliveredBy.entries.map { promiseLine(it, "4 pm") } + promiseLine(null, "4 pm")
        for (line in said) {
            assertFalse(line.contains("standard", ignoreCase = true), line)
            assertFalse(line.contains("same-day", ignoreCase = true), line)
            assertFalse(line.contains("same day", ignoreCase = true), line)
        }
    }
}
