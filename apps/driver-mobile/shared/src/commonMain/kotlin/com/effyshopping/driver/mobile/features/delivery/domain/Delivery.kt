package com.effyshopping.driver.mobile.features.delivery.domain

import com.effyshopping.driver.mobile.core.offline.WriteOutcome
import com.effyshopping.driver.mobile.core.opening.Opening
import com.effyshopping.driver.mobile.features.manifest.domain.ClassSummary
import com.effyshopping.driver.mobile.features.manifest.domain.ManifestLine

/** Same-day delivery domain. DTOs are mapped to these and never leak past the data layer. */

enum class DropStatus { STAGED, OUT_FOR_DELIVERY, EN_ROUTE, ARRIVED, DELIVERED, FAILED }
/**
 * How a delivery was proven. No code method: no delivery code exists, and the backend refuses it.
 * `CONTACTLESS` carries a photograph (an unattended drop is the likeliest dispute) through
 * [CompleteWithMedia], and the method tells "handed over" from "left at the door".
 */
enum class ProofMethod { PHOTO, SIGNATURE, CONTACTLESS }
enum class FailureReason { NOBODY_HOME, WRONG_ADDRESS, CUSTOMER_REFUSED, ACCESS_BLOCKED, OTHER }

/** Why a package did not go in the van. [other] needs a note. */
enum class MissingReason(val label: String, val wire: String) {
    NOT_AT_HUB("Not at the hub", "not_at_hub"),
    DAMAGED("Damaged", "damaged"),
    WRONG_TEMPERATURE("Wrong temperature", "wrong_temperature"),
    OTHER("Other", "other"),
}

/** One package the driver could not load, by its label code. */
data class NotLoaded(val code: String, val reason: MissingReason, val note: String? = null)

data class DropSummary(
    val dropId: String,
    val sequence: Int,
    val orderRef: String,
    val customerSuburb: String,
    val packageCount: Int,
    val status: DropStatus,
    /** What the drop holds, shown in the list without opening it. */
    val summary: ClassSummary = ClassSummary.Empty,
    /** The window the customer was sold; null for an order placed before 069. */
    val window: DeliveryWindow? = null,
    /** Every bag of this drop's packages. */
    val bags: List<com.effyshopping.driver.mobile.core.scan.Bag> = emptyList(),
    /** Rev 2 - the street line, and how a finished drop ended. */
    val street: String? = null,
    val completedAtIso: String? = null,
    val proofMethod: ProofMethod? = null,
    val failureReason: FailureReason? = null,
) {
    val bagCodes: List<String> get() = bags.map { it.code }
}

data class DeliveryRun(
    val runId: String,
    val status: String,
    val drops: List<DropSummary>,
    /**
     * When the round opens; null = open. A 5–7 pm delivery is on this phone from the moment it
     * reaches the hub, and cannot be started until shortly before the window.
     */
    val opening: Opening? = null,
    /** The end of the delivery window (or of the day), in the server's words. */
    val dueLabel: String? = null,
    /** Parcels from this run's failed drops, still to go back to the hub; null when none. */
    val toReturn: ParcelsToReturn? = null,
    /** Rev 2 - the run map. */
    val map: com.effyshopping.driver.mobile.core.map.RunMap? = null,
    /** Where the run is, in the server's words ("Out 2 of 6"); null from an older server. */
    val stageLabel: String? = null,
) {
    /** The van is not loaded yet: loading is the next step, and nothing on a drop can be done. */
    val toLoad: Boolean get() = drops.any { it.status == DropStatus.STAGED }
}

/**
 * What the driver must bring back to the hub from a run's failed drops: how many, and the order
 * numbers (no address). Returned all together, in one action.
 */
data class ParcelsToReturn(
    val runId: String,
    val count: Int,
    val orders: List<String>,
    /** Rev 2 - each parcel, for the Return to hub screen. */
    val parcels: List<ReturnParcel> = emptyList(),
) {
    /** The bags to bring back. */
    val bagCodes: List<String> get() = parcels.flatMap { it.bags }.map { it.code }
}

/** Rev 2 - one parcel coming back: its order ref, label code, where it was for, why. 096 - and its bags. */
data class ReturnParcel(
    val ref: String,
    val packageCode: String,
    val place: String?,
    val reason: FailureReason?,
    val bags: List<com.effyshopping.driver.mobile.core.scan.Bag> = emptyList(),
)

/**
 * One physical package at a drop.
 *
 * Labelled by position and nothing else. A package is one shop's portion, so any other label would
 * name the shop - and hidden fulfilment is a product rule, not a UI choice.
 */
data class DropPackage(
    val ref: String,
    val fromShopCount: Int,
    val items: List<ManifestLine> = emptyList(),
    val summary: ClassSummary = ClassSummary.Empty,
    /** The code on this package's label: bag 1's. */
    val packageCode: String,
    /** This package's bags. */
    val bags: List<com.effyshopping.driver.mobile.core.scan.Bag> = emptyList(),
)

/**
 * How the customer asked for the order to be handed over.
 *
 * A request, never a rule. The driver is told it and the proof chooser leads with it, but no way
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
    /** The customer's handover preference; null for none, and for every older order. */
    val handover: Handover? = null,
    /** The window the customer was sold; null for an order placed before 069. */
    val window: DeliveryWindow? = null,
    /** The last loaded copy, served with no connection. See `ShopStop.stale`. */
    /** When this drop's round opens; null = open. Every action on the drop waits for it. */
    val opening: Opening? = null,
    val stale: Boolean = false,
    /** The customer's phone, sent only while the drop is open; null when there is none to call. */
    val customerPhone: String? = null,
) {
    /**
     * The van has been loaded with this drop. Until it is, the platform refuses every action on
     * it ("Load the van first"), and the drop screen offers none.
     */
    val loaded: Boolean get() = status != DropStatus.STAGED
}

/**
 * Everything the customer told the driver, as one block the instruction callout shows: the handover
 * preference in words, then their note exactly as typed. Null when they said nothing - and the
 * screens then draw no instruction area at all, never a placeholder.
 *
 * The note is customer-authored free text. It is shown through a plain `Text` and never parsed.
 */
val Drop.driverInstructions: String?
    get() = listOfNotNull(handover?.driverSentence, instructions?.trim()?.takeIf { it.isNotEmpty() })
        .joinToString("\n")
        .takeIf { it.isNotEmpty() }

interface DeliveryRepository {
    suspend fun getRun(runId: String): DeliveryRun
    suspend fun getDrop(dropId: String): Drop
    suspend fun advance(dropId: String, to: String, changeId: String): WriteOutcome
    /** Presign → upload the image bytes → complete. Queued when there was no signal (backlog B3). */
    suspend fun completeWithMedia(dropId: String, method: ProofMethod, bytes: ByteArray, note: String?, changeId: String, handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver> = emptyList()): WriteOutcome
    suspend fun fail(dropId: String, reason: FailureReason, note: String?, changeId: String): WriteOutcome
    /** Check every parcel from a run's failed drops back in at the hub. */
    suspend fun returnToHub(runId: String, changeId: String, handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver> = emptyList()): WriteOutcome
    /**
     * The van is loaded: every staged drop on the run goes out for delivery together. 093 - what
     * could not be loaded is declared in [notLoaded]; it comes off the run and is held for dispatch.
     */
    suspend fun load(runId: String, changeId: String, handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver> = emptyList(), notLoaded: List<NotLoaded> = emptyList()): WriteOutcome
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
    suspend operator fun invoke(dropId: String, method: ProofMethod, bytes: ByteArray, note: String?, changeId: String, handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver> = emptyList()) =
        repo.completeWithMedia(dropId, method, bytes, note, changeId, handed)
}
class LoadVan(private val repo: DeliveryRepository) {
    suspend operator fun invoke(runId: String, changeId: String, handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver> = emptyList(), notLoaded: List<NotLoaded> = emptyList()) =
        repo.load(runId, changeId, handed, notLoaded)
}
class ReturnToHub(private val repo: DeliveryRepository) {
    suspend operator fun invoke(runId: String, changeId: String, handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver> = emptyList()) = repo.returnToHub(runId, changeId, handed)
}
class FailDrop(private val repo: DeliveryRepository) {
    suspend operator fun invoke(dropId: String, reason: FailureReason, note: String?, changeId: String) =
        repo.fail(dropId, reason, note, changeId)
}
