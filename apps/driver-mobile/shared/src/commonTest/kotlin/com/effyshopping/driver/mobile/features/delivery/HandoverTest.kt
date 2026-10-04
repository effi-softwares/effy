package com.effyshopping.driver.mobile.features.delivery

import com.effyshopping.driver.mobile.features.delivery.domain.Drop
import com.effyshopping.driver.mobile.features.delivery.domain.DropStatus
import com.effyshopping.driver.mobile.features.delivery.domain.Handover
import com.effyshopping.driver.mobile.features.delivery.domain.driverInstructions
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** 066 — what a driver is shown of what the customer said. */
class HandoverTest {
    private fun drop(instructions: String? = null, handover: Handover? = null) =
        Drop("d1", "EFY-1", "Pat", "1 Test St, Carlton", instructions, emptyList(), DropStatus.ARRIVED, handover = handover)

    /** FR-021 — nothing said means NO instruction area, on every screen. */
    @Test
    fun `nothing said is null - so no instruction area is drawn`() {
        assertNull(drop().driverInstructions)
        assertNull(drop(instructions = "   ").driverInstructions)
    }

    @Test
    fun `the note is shown exactly as the customer typed it`() {
        val note = "Side gate - code 4411\n<b>Don't</b> ring"
        assertEquals(note, drop(instructions = note).driverInstructions)
    }

    /** FR-018 — the preference is said in words. */
    @Test
    fun `a preference alone is said in words`() {
        assertEquals(
            "The customer asked for this to be left at the door.",
            drop(handover = Handover.LeaveAtDoor).driverInstructions,
        )
        assertEquals(
            "The customer wants to receive this in person.",
            drop(handover = Handover.MeetAtDoor).driverInstructions,
        )
    }

    @Test
    fun `the preference comes first and the note follows on its own line`() {
        val text = drop(instructions = "Ring twice", handover = Handover.MeetAtDoor).driverInstructions!!
        assertEquals(listOf("The customer wants to receive this in person.", "Ring twice"), text.split("\n"))
    }

    @Test
    fun `every preference has a sentence a driver can read`() {
        Handover.entries.forEach { assertTrue(it.driverSentence.endsWith(".")) }
    }
}
