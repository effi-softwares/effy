package com.effyshopping.customer.mobile.features.checkout

import com.effyshopping.customer.mobile.commerce.contract.DeliveryFeeLineKind
import com.effyshopping.customer.mobile.commerce.contract.DeliveryMethod
import com.effyshopping.customer.mobile.commerce.contract.DeliveryQuoteDTO
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The Kotlin half of the delivery wire contract. `apis/edge-api/commerce/src/wire.contract.test.ts` parses
 * this file, takes each `const val` and compares it with what the real mapper produces; here the same
 * literal must decode. Renaming a constant breaks that test: rename it there too. Money crosses as a 2-dp
 * decimal string (`feeAmount` stays a String) and counts as integers.
 */
class DeliveryWireContractTest {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    companion object {
        // Read by the backend's wire.contract.test.ts, byte for byte.
        // A serviced address answers `effyWindows` (or `courier` - see CourierWireTest) and
        // nothing else. The delivery charge is the order's, one per window.
        const val DELIVERY_QUOTE_WIRE =
            """{"postcode":"3121","serviced":true,"coverage":"effy","expiresAt":"2026-08-24T12:20:00+10:00","freeDeliveryRemainingAmount":"26.00","effyWindows":{"days":[{"date":"2026-08-24","section":"same_day","windows":[{"slotId":"33333333-3333-3333-3333-333333333333","date":"2026-08-24","startAt":"2026-08-24T17:00:00+10:00","endAt":"2026-08-24T19:00:00+10:00","cutoffAt":"2026-08-24T13:00:00+10:00","surchargeAmount":"5.00","fee":{"lines":[{"kind":"delivery","amount":"6.00"},{"kind":"window_surcharge","amount":"5.00"}],"totalAmount":"11.00"}}],"closedReason":null,"anyTime":null},{"date":"2026-08-25","section":"standard","windows":[],"closedReason":"full","anyTime":null}],"unavailable":null,"asap":null}}"""

        // Read by the backend's wire.contract.test.ts, byte for byte.
        const val DELIVERY_QUOTE_NO_WINDOWS_WIRE =
            """{"postcode":"3121","serviced":true,"coverage":"effy","expiresAt":"2026-08-24T12:20:00+10:00","freeDeliveryRemainingAmount":null,"effyWindows":{"days":[{"date":"2026-08-24","section":"same_day","windows":[],"closedReason":"closed","anyTime":null}],"unavailable":"no_windows","asap":null}}"""
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
        // A full day is said to be full, with no windows - never how full.
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
     * ⚠ 083 - A SERVER THAT STILL SENDS THE REMOVED FIELDS IS STILL READ. The old slot/day/package
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
