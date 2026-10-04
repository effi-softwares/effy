package com.effyshopping.customer.mobile.features.deliveryinstructions.data

import com.effyshopping.customer.mobile.commerce.contract.DeliveryInstructionsDTO
import com.effyshopping.customer.mobile.commerce.contract.HandoverPreference
import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.DeliveryInstructions
import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.Handover

// Wire ↔ domain for delivery instructions (066). Both `when`s are exhaustive with no `else`: a third
// preference on either side must fail to compile here rather than be silently dropped.

internal fun HandoverPreference.toDomain(): Handover = when (this) {
    HandoverPreference.LeaveAtDoor -> Handover.LeaveAtDoor
    HandoverPreference.MeetAtDoor -> Handover.MeetAtDoor
}

internal fun Handover.toWire(): HandoverPreference = when (this) {
    Handover.LeaveAtDoor -> HandoverPreference.LeaveAtDoor
    Handover.MeetAtDoor -> HandoverPreference.MeetAtDoor
}

/** Null for "said nothing" — so a screen never has to tell an empty object from an absent one. */
internal fun DeliveryInstructionsDTO?.toDomain(): DeliveryInstructions? {
    if (this == null) return null
    val out = DeliveryInstructions(handover = handover?.toDomain(), note = note)
    return out.takeUnless { it.isEmpty }
}

internal fun DeliveryInstructions.toWire(): DeliveryInstructionsDTO =
    DeliveryInstructionsDTO(handover = handover?.toWire(), note = note)

/**
 * The value that CLEARS an address's saved default.
 *
 * ⚠ THIS APP'S JSON OMITS NULL FIELDS (`explicitNulls = false`), and the address PATCH reads a
 * field's ABSENCE as "leave it alone". So `null` cannot clear anything from here — it never reaches
 * the wire. An empty object does: it serialises as `{}`, which the server normalises to "no
 * instructions" and stores as such.
 */
internal val ClearedInstructions = DeliveryInstructionsDTO(handover = null, note = null)
