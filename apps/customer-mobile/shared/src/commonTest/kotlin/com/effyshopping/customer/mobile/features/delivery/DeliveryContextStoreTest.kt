package com.effyshopping.customer.mobile.features.delivery

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The delivery context is the mobile half of a rule that must hold identically on three surfaces —
 * the hot path, customer-web, and here. These tests pin the two things that break silently: what
 * counts as a postcode, and what happens when an answer arrives late.
 */
class DeliveryContextStoreTest {

    // ── normalizePostcode: must agree with Go's NormalizePostcode and web's normalizePostcode ────

    @Test
    fun accepts_a_four_digit_postcode() {
        assertEquals("3000", normalizePostcode("3000"))
    }

    @Test
    fun strips_the_separators_a_person_actually_types() {
        assertEquals("3000", normalizePostcode(" 3000 "))
        assertEquals("3000", normalizePostcode("30 00"))
        assertEquals("3000", normalizePostcode("30-00"))
    }

    @Test
    fun keeps_a_significant_leading_zero() {
        assertEquals("0800", normalizePostcode("0800"))
    }

    @Test
    fun rejects_anything_that_is_not_a_postcode() {
        for (raw in listOf("", "  ", "abc", "300", "30000", "3o00", "3000.")) {
            assertNull(normalizePostcode(raw), "expected $raw to be rejected")
        }
    }

    /**
     * A leading or trailing separator is REJECTED, not stripped.
     *
     * Without this rule "-1000" normalises to "1000" and the shopper is told whether Effy delivers to
     * a postcode they did not enter. All three surfaces share the rule; if this test changes, the Go
     * and TypeScript ones must change with it.
     */
    @Test
    fun rejects_a_leading_or_trailing_separator_rather_than_stripping_it() {
        assertNull(normalizePostcode("-1000"))
        assertNull(normalizePostcode("1000-"))
    }

    // ── the store ────────────────────────────────────────────────────────────────────────────────

    @Test
    fun stores_a_normalised_postcode_with_no_answer_yet() {
        val store = DeliveryContextStore()
        assertEquals("3000", store.setPostcode(" 3000 "))

        val context = store.state.value!!
        assertEquals("3000", context.postcode)
        // null, NOT false — "we have not asked" and "we do not deliver there" are different states.
        assertNull(context.serviced)
    }

    @Test
    fun refuses_input_that_is_not_a_postcode_without_disturbing_what_is_stored() {
        val store = DeliveryContextStore()
        store.setPostcode("3000")
        assertNull(store.setPostcode("nonsense"))
        assertEquals("3000", store.state.value?.postcode)
    }

    @Test
    fun records_an_answer_against_its_own_postcode() {
        val store = DeliveryContextStore()
        store.setPostcode("3000")
        store.recordServiceability("3000", true)
        assertEquals(true, store.state.value?.serviced)
    }

    /** The late-response race: the answer for a superseded postcode must be discarded. */
    @Test
    fun ignores_an_answer_for_a_postcode_the_shopper_moved_away_from() {
        val store = DeliveryContextStore()
        store.setPostcode("3000")
        store.setPostcode("3001") // the shopper corrects themselves
        store.recordServiceability("3000", true) // the slow first response lands

        assertEquals("3001", store.state.value?.postcode)
        assertNull(store.state.value?.serviced, "a stale answer must not be shown against a new postcode")
    }

    @Test
    fun clearing_forgets_the_location() {
        val store = DeliveryContextStore()
        store.setPostcode("3000")
        store.clear()
        assertNull(store.state.value)
    }

    @Test
    fun seeds_from_the_account_when_the_device_has_no_location() {
        val store = DeliveryContextStore()
        store.seedFromAccount("3000")
        assertEquals("3000", store.state.value?.postcode)
        assertEquals(DeliverySource.ACCOUNT, store.state.value?.source)
    }

    /** An explicit choice on this device outranks a saved default. */
    @Test
    fun does_not_overwrite_a_location_the_shopper_set_themselves() {
        val store = DeliveryContextStore()
        store.setPostcode("3001")
        store.seedFromAccount("3000")
        assertEquals("3001", store.state.value?.postcode)
        assertEquals(DeliverySource.GUEST, store.state.value?.source)
    }

    // ── the persistence seam ─────────────────────────────────────────────────────────────────────

    @Test
    fun restores_an_injected_initial_postcode() {
        val store = DeliveryContextStore(initialPostcode = "3000")
        assertEquals("3000", store.state.value?.postcode)
        // Restored, but not yet verified — the answer is re-checked on launch.
        assertNull(store.state.value?.serviced)
    }

    @Test
    fun hands_every_change_to_the_persistence_callback() {
        val written = mutableListOf<String?>()
        val store = DeliveryContextStore(initialPostcode = null, persist = { written.add(it) })

        store.setPostcode("3000")
        store.clear()

        assertEquals(listOf("3000", null), written)
        assertTrue(written.size == 2, "persist must be called for both a set and a clear")
    }
}

/* ── 030: the place a shopper CHOSE, seeding, and the sign-out provenance rule ─────────────────── */

class DeliveryContextStore030Test {

    @Test
    fun setPlaceStoresTheLocalityAndStateAlongsideThePostcode() {
        val store = DeliveryContextStore()
        store.setPlace("Richmond", "VIC", "3121")
        val c = store.state.value!!
        assertEquals("Richmond", c.locality)
        assertEquals("VIC", c.state)
        assertEquals("3121", c.postcode)
        assertNull(c.serviced)
    }

    /**
     * ⚠ Showing the PREVIOUS place's name beside a new postcode is worse than showing no name: it
     * asserts, confidently, that we are answering about somewhere the shopper has moved away from.
     */
    @Test
    fun switchingToABarePostcodeClearsTheStaleLocality() {
        val store = DeliveryContextStore()
        store.setPlace("Richmond", "VIC", "3121")
        store.setPostcode("3000")
        assertEquals("3000", store.state.value!!.postcode)
        assertNull(store.state.value!!.locality)
    }

    @Test
    fun setPlaceRejectsSomethingThatIsNotAPostcode() {
        val store = DeliveryContextStore()
        assertNull(store.setPlace("Nowhere", "VIC", "abc"))
        assertNull(store.state.value)
    }

    // ── Seeding (FR-018/FR-019) ────────────────────────────────────────────────────────────────

    @Test
    fun seedingCarriesThePlaceNotJustTheDigits() {
        val store = DeliveryContextStore()
        store.seedFromAccount("3121", locality = "Richmond", state = "VIC")
        val c = store.state.value!!
        assertEquals("Richmond", c.locality)
        assertEquals("VIC", c.state)
        assertEquals(DeliverySource.ACCOUNT, c.source)
    }

    /** ⚠ `region` is nullable on existing addresses — seeding must tolerate a missing state. */
    @Test
    fun seedingToleratesAnAddressWithNoStateRecorded() {
        val store = DeliveryContextStore()
        store.seedFromAccount("3121")
        assertEquals("3121", store.state.value!!.postcode)
        assertNull(store.state.value!!.state)
    }

    /** FR-019: an explicit choice on this device outranks the account default. */
    @Test
    fun seedingNeverOverwritesAChoiceTheShopperMade() {
        val store = DeliveryContextStore()
        store.setPlace("Richmond", "VIC", "3121")
        store.seedFromAccount("3000", locality = "Melbourne", state = "VIC")
        assertEquals("3121", store.state.value!!.postcode)
        assertEquals(DeliverySource.GUEST, store.state.value!!.source)
    }

    @Test
    fun seedingIgnoresAnAddressWhosePostcodeIsNotAPostcode() {
        val store = DeliveryContextStore()
        store.seedFromAccount("not-a-postcode")
        assertNull(store.state.value)
    }

    // ── Sign-out provenance (FR-023) ───────────────────────────────────────────────────────────

    /** A place taken from someone's account must not outlive the session — the device may be shared. */
    @Test
    fun signOutClearsAnAccountDerivedLocation() {
        val store = DeliveryContextStore()
        store.seedFromAccount("3000", locality = "Melbourne", state = "VIC")
        store.clearAccountContext()
        assertNull(store.state.value)
    }

    /** ...but a place the shopper typed here is their own preference and survives. */
    @Test
    fun signOutKeepsALocationTheShopperSetThemselves() {
        val store = DeliveryContextStore()
        store.setPlace("Richmond", "VIC", "3121")
        store.clearAccountContext()
        assertEquals("3121", store.state.value!!.postcode)
    }

    @Test
    fun signOutWithNoLocationSetDoesNothing() {
        val store = DeliveryContextStore()
        store.clearAccountContext()
        assertNull(store.state.value)
    }
}
