package com.effyshopping.customer.mobile.features.deliveryinstructions.domain

/**
 * Delivery instructions (066) — what a shopper tells the driver: how to hand the order over, and a
 * short note. Shared by checkout, the receipt and the address book.
 *
 * ⚠ THE RULE IS THE SERVER'S. What is valid — how whitespace collapses, what counts as blank — is
 * `normaliseDeliveryInstructions` in `packages/shared-types`, mirrored by the Go hot path and pinned
 * to it by a shared fixture. This app does NOT carry a third copy of that rule: it clamps typing to
 * the limit so the counter can stop at zero, sends what was typed, and shows what the server stored.
 * The one thing duplicated here is the NUMBER ([NOTE_MAX]), which `DeliveryInstructionsTest` pins.
 */

/** ⚠ Must equal `DELIVERY_NOTE_MAX` in `packages/shared-types/src/delivery-instructions.ts`. */
const val NOTE_MAX = 250

enum class Handover(val label: String) {
    LeaveAtDoor("Leave at the door"),
    MeetAtDoor("Meet at the door"),
}

/** Instructions as stored — on a placed order, or as an address's saved default. */
data class DeliveryInstructions(val handover: Handover?, val note: String?) {
    /** Nothing to show. Every surface checks this before drawing an instruction area at all. */
    val isEmpty: Boolean get() = handover == null && note.isNullOrBlank()
}

/** What the shopper is editing. [note] is as typed. */
data class InstructionsDraft(val handover: Handover? = null, val note: String = "") {
    /** How many more characters fit, counted as a person counts them (an emoji is one). */
    val remaining: Int get() = NOTE_MAX - note.codePointLength()

    /** What to send, or null when the shopper said nothing. */
    fun toInstructions(): DeliveryInstructions? {
        val trimmed = note.trim().takeIf { it.isNotEmpty() }
        return if (handover == null && trimmed == null) null else DeliveryInstructions(handover, trimmed)
    }

    /** Two drafts that would send the same thing. */
    fun sameAs(other: InstructionsDraft): Boolean = toInstructions() == other.toInstructions()

    companion object {
        fun from(saved: DeliveryInstructions?): InstructionsDraft =
            InstructionsDraft(handover = saved?.handover, note = saved?.note.orEmpty())
    }
}

/** Unicode code points — the unit the limit is stated in. A surrogate pair counts once. */
fun String.codePointLength(): Int {
    var n = 0
    var i = 0
    while (i < length) {
        i += if (this[i].isHighSurrogate() && i + 1 < length && this[i + 1].isLowSurrogate()) 2 else 1
        n++
    }
    return n
}

/**
 * Keep typing inside the limit, never splitting a surrogate pair. ⚠ This limits what can be TYPED;
 * it is not validation, and nothing a shopper submitted is ever shortened behind their back — the
 * server refuses an over-long note outright.
 */
fun String.clampToNoteMax(): String {
    if (codePointLength() <= NOTE_MAX) return this
    var n = 0
    var i = 0
    while (i < length && n < NOTE_MAX) {
        i += if (this[i].isHighSurrogate() && i + 1 < length && this[i + 1].isLowSurrogate()) 2 else 1
        n++
    }
    return substring(0, i)
}
