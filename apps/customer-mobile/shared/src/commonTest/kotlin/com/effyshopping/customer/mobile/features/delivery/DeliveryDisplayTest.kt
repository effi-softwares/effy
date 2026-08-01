package com.effyshopping.customer.mobile.features.delivery

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * ⚠ These cases come from the FOUR-ROW TABLE in
 * `specs/030-delivery-location-suburb/contracts/locality.contract.md` §2 — not from reading
 * [formatPlace]. 028 and 029 both shipped tests whose fixtures agreed with the code rather than with
 * the world (029's banner test literally asserted the defect it existed to catch). Writing these
 * against the contract instead of the implementation is the counter-measure.
 *
 * The identical four rows are asserted on web in `lib/delivery-display.test.ts`. If the two surfaces
 * ever disagree, one of these files is wrong and a shopper is being told two different things about
 * the same place.
 */
class DeliveryDisplayTest {

    private fun ctx(
        postcode: String,
        locality: String? = null,
        state: String? = null,
        serviced: Boolean? = null,
    ) = DeliveryContext(
        postcode = postcode,
        locality = locality,
        state = state,
        serviced = serviced,
        source = DeliverySource.GUEST,
    )

    // ── The contract's four rows ────────────────────────────────────────────────────────────────

    @Test
    fun namesThePlaceTheShopperChose() {
        assertEquals("Richmond VIC 3121", formatPlace(ctx("3121", "Richmond", "VIC")))
    }

    /**
     * ⚠ FR-034. The shopper typed digits; a postcode covering several suburbs has no single right
     * name, and picking one asserts a choice they never made.
     */
    @Test
    fun doesNotInventASuburbForABarePostcode() {
        assertEquals("VIC 3121", formatPlace(ctx("3121", locality = null, state = "VIC")))
    }

    /** FR-034a: with exactly one candidate there is nothing to choose between, so naming it is safe. */
    @Test
    fun namesTheSoleCandidateForAnUnambiguousPostcode() {
        assertEquals("Melbourne VIC 3000", formatPlace(ctx("3000", "Melbourne", "VIC")))
    }

    /** FR-034b: a failed name lookup degrades to digits — and must not touch the verdict. */
    @Test
    fun fallsBackToTheBarePostcodeWhenNothingResolved() {
        assertEquals("3121", formatPlace(ctx("3121")))
    }

    // ── The invariants that fall out of the table ───────────────────────────────────────────────

    /**
     * ⚠ A set location that renders as an empty string is indistinguishable from no location at all —
     * the shopper would see "Set your delivery location" while one is stored.
     */
    @Test
    fun neverRendersAsEmptyForASetLocation() {
        for (c in listOf(ctx("3121"), ctx("0800", "Darwin", "NT"), ctx("3121", state = "VIC"))) {
            assertTrue(formatPlace(c).isNotEmpty(), "empty for $c")
        }
    }

    /** ⚠ NT postcodes begin 08xx and must survive as text all the way to the screen. */
    @Test
    fun preservesALeadingZeroPostcode() {
        assertEquals("Darwin NT 0800", formatPlace(ctx("0800", "Darwin", "NT")))
    }

    /** The postcode is what the verdict is keyed on, so it is always present. */
    @Test
    fun alwaysIncludesThePostcode() {
        assertTrue(formatPlace(ctx("3121", "Richmond", "VIC")).contains("3121"))
        assertTrue(formatPlace(ctx("3121")).contains("3121"))
    }

    // ── The announcement (FR-042) ───────────────────────────────────────────────────────────────

    @Test
    fun announcesThePlaceInTheSameWordsAsTheDisplay() {
        val c = ctx("3121", "Richmond", "VIC", serviced = true)
        assertTrue(announcePlace(c)!!.contains(formatPlace(c)))
    }

    @Test
    fun distinguishesDeliveringFromNotDelivering() {
        assertEquals(
            "Effy delivers to Richmond VIC 3121.",
            announcePlace(ctx("3121", "Richmond", "VIC", serviced = true)),
        )
        assertEquals(
            "Effy does not deliver to Richmond VIC 3121 yet.",
            announcePlace(ctx("3121", "Richmond", "VIC", serviced = false)),
        )
    }

    /**
     * ⚠ THE RULE THIS WHOLE CAPABILITY EXISTS FOR. `serviced == null` means "we have not got an
     * answer" — it is NOT "no", and it must never be announced as one. Silence is correct: the live
     * region says nothing until there is something true to say.
     */
    @Test
    fun announcesNothingWhenThereIsNoAnswerYet() {
        assertNull(announcePlace(ctx("3121", "Richmond", "VIC", serviced = null)))
    }
}
