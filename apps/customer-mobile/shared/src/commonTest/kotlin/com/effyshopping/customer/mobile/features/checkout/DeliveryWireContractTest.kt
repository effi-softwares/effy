package com.effyshopping.customer.mobile.features.checkout

import com.effyshopping.customer.mobile.commerce.contract.DeliveryFeeLineKind
import com.effyshopping.customer.mobile.commerce.contract.DeliveryMethod
import com.effyshopping.customer.mobile.commerce.contract.DeliveryQuoteDTO
import com.effyshopping.customer.mobile.commerce.contract.ServiceabilityDTO
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The Kotlin half of the delivery wire contract (047, research R14).
 *
 * ⚠ THE BACKEND HALF READS THESE LITERALS OUT OF THIS FILE (070). It used to be a second test, in a
 * second language, holding a hand-made copy kept in step by comments. Now `apis/edge-api/commerce/src/wire.contract.test.ts` parses this
 * source, takes each `const val`, and compares it with what the real mapper produces — so there is
 * one copy. Renaming a constant here breaks that test on purpose: rename it there too.
 *
 * ⚠ ONE LITERAL, TWO INDEPENDENT JUDGES. The old arrangement kept two hand-made copies on the theory
 * that a shared fixture "moves with the bug". This one cannot: the literal is judged here by whether
 * the app can DECODE it, and on the backend by whether the real mapper PRODUCES it. Change the
 * literal and both must still agree with it separately; change either side's code and its own test
 * fails. (029 found the two-copy version agreeing with itself about a payload no server ever sent.)
 *
 * ⚠ WHY THIS EXISTS. 027 lost days because Kotlin serialised money/counts as `Double` and Go could not
 * unmarshal `1.0` into an int. Delivery money crosses as a 2-dp decimal STRING for exactly that reason;
 * this test proves the generated Kotlin parses Go's exact bytes and that `feeAmount` stays a String.
 */
class DeliveryWireContractTest {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    companion object {
        // What GET /storefront/v1/serviceability answers.
        const val SERVICEABILITY_WIRE = """{"postcode":"3121","serviced":true}"""

        // Read by the backend's wire.contract.test.ts, byte for byte.
        // ⚠ 083: a serviced address answers `effyWindows` (or `courier` — see CourierWireTest) and
        // nothing else. The delivery charge is the ORDER's, one per window (077).
        const val DELIVERY_QUOTE_WIRE =
            """{"postcode":"3121","serviced":true,"coverage":"effy","expiresAt":"2026-08-24T12:20:00+10:00","freeDeliveryRemainingAmount":"26.00","effyWindows":{"days":[{"date":"2026-08-24","section":"same_day","windows":[{"slotId":"33333333-3333-3333-3333-333333333333","date":"2026-08-24","startAt":"2026-08-24T17:00:00+10:00","endAt":"2026-08-24T19:00:00+10:00","cutoffAt":"2026-08-24T13:00:00+10:00","surchargeAmount":"5.00","fee":{"lines":[{"kind":"delivery","amount":"6.00"},{"kind":"window_surcharge","amount":"5.00"}],"totalAmount":"11.00"}}],"closedReason":null},{"date":"2026-08-25","section":"standard","windows":[],"closedReason":"full"}],"unavailable":null}}"""

        // Read by the backend's wire.contract.test.ts, byte for byte.
        const val DELIVERY_QUOTE_NO_WINDOWS_WIRE =
            """{"postcode":"3121","serviced":true,"coverage":"effy","expiresAt":"2026-08-24T12:20:00+10:00","freeDeliveryRemainingAmount":null,"effyWindows":{"days":[{"date":"2026-08-24","section":"same_day","windows":[],"closedReason":"closed"}],"unavailable":"no_windows"}}"""
    }

    @Test
    fun `Kotlin decodes the server's serviceability bytes`() {
        val dto = json.decodeFromString<ServiceabilityDTO>(SERVICEABILITY_WIRE)
        assertEquals("3121", dto.postcode)
        assertTrue(dto.serviced)
    }

    @Test
    fun `Kotlin decodes the server's delivery-quote bytes - windows, with every amount a String`() {
        val dto = json.decodeFromString<DeliveryQuoteDTO>(DELIVERY_QUOTE_WIRE)

        assertEquals("3121", dto.postcode)
        assertTrue(dto.serviced)
        assertEquals("26.00", dto.freeDeliveryRemainingAmount)

        val windows = dto.effyWindows!!
        assertEquals(null, windows.unavailable)
        val (today, later) = windows.days
        assertEquals("2026-08-24", today.date)
        assertEquals(DeliveryMethod.SameDay, today.section)
        assertEquals(DeliveryMethod.Standard, later.section)

        val window = today.windows.single()
        assertEquals("33333333-3333-3333-3333-333333333333", window.slotID)
        assertEquals("2026-08-24T17:00:00+10:00", window.startAt)
        assertEquals("2026-08-24T19:00:00+10:00", window.endAt)
        assertEquals("2026-08-24T13:00:00+10:00", window.cutoffAt)
        // ⚠ The 027 R13 guard: money is a String, not a number. If the contract ever regressed to a
        // numeric type this would not compile / would fail to parse "5.00".
        assertEquals("5.00", window.surchargeAmount)
        assertEquals("11.00", window.fee.totalAmount)
        assertEquals(
            listOf(DeliveryFeeLineKind.Delivery to "6.00", DeliveryFeeLineKind.WindowSurcharge to "5.00"),
            window.fee.lines.map { it.kind to it.amount },
        )
        // A full day is said to be full, with no windows — never how full.
        assertTrue(later.windows.isEmpty())
        assertEquals(com.effyshopping.customer.mobile.commerce.contract.EffyDayClosedReason.Full, later.closedReason)
    }

    @Test
    fun `an unserviced quote says so and nothing else`() {
        val dto = json.decodeFromString<DeliveryQuoteDTO>(
            // What the quote mapper emits for an address nobody delivers to.
            """{"postcode":"3999","serviced":false,"coverage":"none","expiresAt":""}""",
        )
        assertFalse(dto.serviced)
        assertEquals(null, dto.effyWindows)
        assertEquals(null, dto.courier)
    }

    @Test
    fun `Kotlin decodes a quote with no window anywhere`() {
        val dto = json.decodeFromString<DeliveryQuoteDTO>(DELIVERY_QUOTE_NO_WINDOWS_WIRE)
        val windows = dto.effyWindows!!
        assertEquals(com.effyshopping.customer.mobile.commerce.contract.Unavailable.NoWindows, windows.unavailable)
        assertTrue(windows.days.single().windows.isEmpty())
        assertEquals(null, dto.freeDeliveryRemainingAmount)
    }

    /**
     * ⚠ 083 — A SERVER THAT STILL SENDS THE REMOVED FIELDS IS STILL READ. The old slot/day/package
     * fields are gone from the contract; `ignoreUnknownKeys` means a response that carries them (a
     * deploy out of step) decodes, and they are simply not looked at.
     */
    @Test
    fun `fields the contract no longer has are ignored, not a decode failure`() {
        val dto = json.decodeFromString<DeliveryQuoteDTO>(
            """{"postcode":"3121","serviced":true,"coverage":"effy","expiresAt":"x","packages":[{"shopRef":"pkg-1","options":[]}],"sameDaySlots":[],"standardDays":[{"date":"2026-08-25"}],"effyWindows":{"days":[],"unavailable":"none_defined"}}""",
        )
        assertTrue(dto.serviced)
        assertEquals(com.effyshopping.customer.mobile.commerce.contract.Unavailable.NoneDefined, dto.effyWindows!!.unavailable)
    }
}
