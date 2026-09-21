package com.effyshopping.driver.mobile.features.delivery.domain

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
)

data class DeliveryRun(val runId: String, val status: String, val drops: List<DropSummary>)

data class DropPackage(val ref: String, val fromShopCount: Int)

data class Drop(
    val dropId: String,
    val orderRef: String,
    val customerName: String,
    val addressFull: String,
    val instructions: String?,
    val packages: List<DropPackage>,
    val status: DropStatus,
)

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
