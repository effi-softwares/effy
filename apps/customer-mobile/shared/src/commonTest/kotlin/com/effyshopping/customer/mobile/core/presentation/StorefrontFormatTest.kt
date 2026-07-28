package com.effyshopping.customer.mobile.core.presentation

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * 025 — the storefront's display formatting, consolidated from six copy-pasted private helpers.
 *
 * These exist because the rules they encode are the ones a storefront gets quietly wrong: a
 * struck-through price that is not actually higher, a "-0%" chip, and a discount percentage that
 * disagrees with the web by one point.
 */
class StorefrontFormatTest {

    @Test fun aud_usesTheDollarSymbol() {
        assertEquals("$19.99", money("19.99", "AUD"))
    }

    @Test fun otherCurrencies_arePrefixedWithTheCode() {
        // Not a bare "$" — the platform is single-currency today, but a wrong symbol on a price is a
        // worse failure than an unfamiliar code.
        assertEquals("NZD 19.99", money("19.99", "NZD"))
    }

    @Test fun theWireAmountIsPassedThroughUnparsed() {
        // Amounts arrive as an already-2dp decimal string (numeric(12,2)::text). Parsing to a Double
        // to "format" it is how a storefront starts showing $19.989999.
        assertEquals("$5.00", money("5.00", "AUD"))
    }

    @Test fun aCompareAtAboveThePriceIsADiscount() {
        assertTrue(isDiscounted("60.00", "100.00"))
    }

    @Test fun noCompareAtIsNotADiscount() {
        assertFalse(isDiscounted("60.00", null))
    }

    @Test fun aCompareAtEqualToOrBelowThePriceIsNotADiscount() {
        // Stale or mis-entered data. Rendering it would strike through a price identical to — or
        // lower than — the one being charged.
        assertFalse(isDiscounted("60.00", "60.00"))
        assertFalse(isDiscounted("60.00", "45.00"))
    }

    @Test fun unparseableAmountsAreNotADiscount() {
        assertFalse(isDiscounted("", "100.00"))
        assertFalse(isDiscounted("60.00", "not-a-number"))
    }

    @Test fun percentRoundsRatherThanTruncating() {
        // ⚠ This is the assertion that fails if someone "simplifies" roundToInt() back to toInt().
        //
        // $10.00 → $6.55 is a saving of 34.5%. Truncation calls that 34; rounding calls it 35, and
        // `ProductCard.tsx` uses Math.round — so truncating here would put the two customer surfaces
        // a point apart on the same product, which support cannot explain to a shopper.
        assertEquals(35, discountPercent("6.55", "10.00"))

        // And a fraction below the halfway point still rounds down, so this is genuinely rounding
        // rather than an unconditional +1.
        assertEquals(33, discountPercent("6.66", "10.00")) // 33.4%
    }

    @Test fun percentIsNullWhenThereIsNoDiscount() {
        assertNull(discountPercent("60.00", null))
        assertNull(discountPercent("60.00", "60.00"))
    }

    @Test fun aSavingThatRoundsToNothingRendersNoChip() {
        // $99.999 vs $100.00 is 0.001% — a "-0%" chip is worse than no chip.
        assertNull(discountPercent("99.999", "100.00"))
    }
}
