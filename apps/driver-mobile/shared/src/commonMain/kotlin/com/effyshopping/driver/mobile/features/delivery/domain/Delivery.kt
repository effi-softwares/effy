package com.effyshopping.driver.mobile.features.delivery.domain

import com.effyshopping.driver.mobile.features.manifest.domain.ClassSummary
import com.effyshopping.driver.mobile.features.manifest.domain.ManifestLine

/** Same-day delivery domain (049 US2). DTOs are mapped to these and never leak past the data layer. */

enum class DropStatus { STAGED, OUT_FOR_DELIVERY, EN_ROUTE, ARRIVED, DELIVERED, FAILED }
/**
 * ⚠ `CODE` REMOVED BY 064 (FR-003). No delivery code exists anywhere on the platform —
 * `delivery_code` appears in no service, migration, contract or app — so a code proof could only
 * compare a value to itself. The backend refuses the method by name and the database CHECK excludes
 * it; leaving the case here would be a value nothing can ever produce, which is 059's dormant
 * `device.ts` shape. The WIRE enum keeps it, because the method is coming.
 *
 * ⚠ `CONTACTLESS` NOW CARRIES MEDIA. An unattended drop is the case most likely to become a dispute,
 * so it is the one that must be photographed (FR-002) — it goes through [CompleteWithMedia] like a
 * photo or a signature, and the method is what distinguishes "handed over" from "left at the door".
 */
enum class ProofMethod { PHOTO, SIGNATURE, CONTACTLESS }
enum class FailureReason { NOBODY_HOME, WRONG_ADDRESS, CUSTOMER_REFUSED, ACCESS_BLOCKED, OTHER }

data class DropSummary(
    val dropId: String,
    val sequence: Int,
    val orderRef: String,
    val customerSuburb: String,
    val packageCount: Int,
    val status: DropStatus,
    /** 065 — what the drop holds, shown in the list without opening it. */
    val summary: ClassSummary = ClassSummary.Empty,
    /** 069 — the window the customer was sold; null for an order placed before 069. */
    val window: DeliveryWindow? = null,
)

data class DeliveryRun(val runId: String, val status: String, val drops: List<DropSummary>)

/**
 * One physical package at a drop (065).
 *
 * ⚠ LABELLED BY POSITION AND NOTHING ELSE. A package is one shop's portion, so any other label would
 * name the shop — and hidden fulfilment is a product rule, not a UI choice.
 */
data class DropPackage(
    val ref: String,
    val fromShopCount: Int,
    val items: List<ManifestLine> = emptyList(),
    val summary: ClassSummary = ClassSummary.Empty,
)

/**
 * How the customer asked for the order to be handed over (066).
 *
 * ⚠ A REQUEST, NEVER A RULE. The driver is told it and the proof chooser leads with it, but no way
 * of completing the drop is ever removed: a customer who asked for "leave at the door" and then
 * opens it is handed the package, and a "meet at the door" customer who is not home is recorded as
 * a failed delivery, exactly as before.
 */
enum class Handover(val driverSentence: String) {
    LeaveAtDoor("The customer asked for this to be left at the door."),
    MeetAtDoor("The customer wants to receive this in person."),
}

data class Drop(
    val dropId: String,
    val orderRef: String,
    val customerName: String,
    val addressFull: String,
    val instructions: String?,
    val packages: List<DropPackage>,
    val status: DropStatus,
    val summary: ClassSummary = ClassSummary.Empty,
    /** 066 — the customer's handover preference; null for none, and for every older order. */
    val handover: Handover? = null,
    /** 069 — the window the customer was sold; null for an order placed before 069. */
    val window: DeliveryWindow? = null,
    /** 065 — the last loaded copy, served with no connection. See `ShopStop.stale`. */
    val stale: Boolean = false,
)

/**
 * Everything the customer told the driver, as ONE block the instruction callout shows: the handover
 * preference in words, then their note exactly as typed. Null when they said nothing — and the
 * screens then draw no instruction area at all (066 FR-021), never a placeholder.
 *
 * ⚠ The note is customer-authored free text. It is shown through a plain `Text` and never parsed.
 */
val Drop.driverInstructions: String?
    get() = listOfNotNull(handover?.driverSentence, instructions?.trim()?.takeIf { it.isNotEmpty() })
        .joinToString("\n")
        .takeIf { it.isNotEmpty() }

interface DeliveryRepository {
    suspend fun getRun(runId: String): DeliveryRun
    suspend fun getDrop(dropId: String): Drop
    suspend fun advance(dropId: String, to: String, changeId: String): DropStatus
    /** Presign → upload the image bytes → complete with method photo|signature. Throws on failure. */
    suspend fun completeWithMedia(dropId: String, method: ProofMethod, bytes: ByteArray, note: String?, changeId: String)
    suspend fun fail(dropId: String, reason: FailureReason, note: String?, changeId: String)
}

class GetDeliveryRun(private val repo: DeliveryRepository) {
    suspend operator fun invoke(runId: String) = repo.getRun(runId)
}
class GetDrop(private val repo: DeliveryRepository) {
    suspend operator fun invoke(dropId: String) = repo.getDrop(dropId)
}
class AdvanceDrop(private val repo: DeliveryRepository) {
    suspend operator fun invoke(dropId: String, to: String, changeId: String) = repo.advance(dropId, to, changeId)
}
class CompleteWithMedia(private val repo: DeliveryRepository) {
    suspend operator fun invoke(dropId: String, method: ProofMethod, bytes: ByteArray, note: String?, changeId: String) =
        repo.completeWithMedia(dropId, method, bytes, note, changeId)
}
class FailDrop(private val repo: DeliveryRepository) {
    suspend operator fun invoke(dropId: String, reason: FailureReason, note: String?, changeId: String) =
        repo.fail(dropId, reason, note, changeId)
}
