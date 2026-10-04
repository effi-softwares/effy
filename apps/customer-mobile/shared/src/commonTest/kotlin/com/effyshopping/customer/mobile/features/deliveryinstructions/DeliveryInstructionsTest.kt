package com.effyshopping.customer.mobile.features.deliveryinstructions

import com.effyshopping.customer.mobile.commerce.contract.DeliveryInstructionsDTO
import com.effyshopping.customer.mobile.commerce.contract.HandoverPreference
import com.effyshopping.customer.mobile.core.http.effyJson
import com.effyshopping.customer.mobile.features.addresses.data.toWireDefault
import com.effyshopping.customer.mobile.features.deliveryinstructions.data.toDomain
import com.effyshopping.customer.mobile.features.deliveryinstructions.data.toWire
import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.DeliveryInstructions
import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.Handover
import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.InstructionsDraft
import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.NOTE_MAX
import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.clampToNoteMax
import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.codePointLength
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** 066 — the draft a shopper edits, the limit, and what actually goes on the wire. */
class DeliveryInstructionsTest {

    /** ⚠ Must equal DELIVERY_NOTE_MAX in packages/shared-types/src/delivery-instructions.ts. */
    @Test
    fun `the limit is the platform's 250`() {
        assertEquals(250, NOTE_MAX)
    }

    @Test
    fun `an untouched draft sends nothing`() {
        assertNull(InstructionsDraft().toInstructions())
        assertNull(InstructionsDraft(note = "   \n ").toInstructions())
    }

    @Test
    fun `a draft sends its choice and its trimmed note`() {
        assertEquals(
            DeliveryInstructions(Handover.LeaveAtDoor, "Side gate"),
            InstructionsDraft(Handover.LeaveAtDoor, "  Side gate ").toInstructions(),
        )
        assertEquals(DeliveryInstructions(Handover.MeetAtDoor, null), InstructionsDraft(Handover.MeetAtDoor).toInstructions())
    }

    /** FR-004 / FR-029 — an emoji is one character to the person typing it. */
    @Test
    fun `length is counted in code points`() {
        assertEquals(2, "🚪🚪".codePointLength())
        assertEquals(4, "🚪🚪".length)
        assertEquals(249, InstructionsDraft(note = "🚪").remaining)
    }

    @Test
    fun `typing stops at the limit and never splits an emoji`() {
        val full = "🚪".repeat(NOTE_MAX)
        assertEquals(full, (full + "x").clampToNoteMax())
        assertEquals(0, InstructionsDraft(note = full).remaining)
        val mixed = "x".repeat(NOTE_MAX - 1) + "🚪🚪"
        val clamped = mixed.clampToNoteMax()
        assertEquals(NOTE_MAX, clamped.codePointLength())
        assertTrue(clamped.endsWith("🚪"))
        assertEquals("short", "short".clampToNoteMax())
    }

    @Test
    fun `the wire maps both ways and nothing said is null`() {
        assertEquals(
            DeliveryInstructions(Handover.MeetAtDoor, "Ring twice"),
            DeliveryInstructionsDTO(HandoverPreference.MeetAtDoor, "Ring twice").toDomain(),
        )
        assertNull((null as DeliveryInstructionsDTO?).toDomain())
        assertNull(DeliveryInstructionsDTO().toDomain())
        assertEquals(
            DeliveryInstructionsDTO(HandoverPreference.LeaveAtDoor, null),
            DeliveryInstructions(Handover.LeaveAtDoor, null).toWire(),
        )
    }

    /**
     * ⚠ THE CLEAR CASE. This app's JSON omits nulls, and the address PATCH reads an omitted field as
     * "leave it alone" — so a cleared default must go out as an EMPTY OBJECT, or the server keeps the
     * instructions the shopper just removed and nothing anywhere reports an error.
     */
    @Test
    fun `clearing an address's default sends an empty object - not an omitted field`() {
        val cleared = InstructionsDraft().toWireDefault()
        assertEquals("{}", effyJson.encodeToString(DeliveryInstructionsDTO.serializer(), cleared))

        val set = InstructionsDraft(Handover.LeaveAtDoor, "Side gate").toWireDefault()
        assertEquals(
            """{"handover":"leave_at_door","note":"Side gate"}""",
            effyJson.encodeToString(DeliveryInstructionsDTO.serializer(), set),
        )
    }

    @Test
    fun `two drafts are the same when they would send the same thing`() {
        assertTrue(InstructionsDraft(note = " A ").sameAs(InstructionsDraft(note = "A")))
        assertTrue(!InstructionsDraft(note = "A").sameAs(InstructionsDraft(Handover.LeaveAtDoor, "A")))
    }
}
