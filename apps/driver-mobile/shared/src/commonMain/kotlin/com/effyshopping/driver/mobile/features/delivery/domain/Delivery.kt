package com.effyshopping.driver.mobile.features.delivery.domain

/** Same-day delivery domain (049 US2). DTOs are mapped to these and never leak past the data layer. */

enum class DropStatus { STAGED, OUT_FOR_DELIVERY, EN_ROUTE, ARRIVED, DELIVERED, FAILED }
enum class ProofMethod { PHOTO, CODE, SIGNATURE, CONTACTLESS }
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
    suspend fun completeWithCode(dropId: String, code: String, note: String?, changeId: String)
    suspend fun completeContactless(dropId: String, note: String?, changeId: String)
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
class CompleteWithCode(private val repo: DeliveryRepository) {
    suspend operator fun invoke(dropId: String, code: String, note: String?, changeId: String) =
        repo.completeWithCode(dropId, code, note, changeId)
}
class CompleteContactless(private val repo: DeliveryRepository) {
    suspend operator fun invoke(dropId: String, note: String?, changeId: String) =
        repo.completeContactless(dropId, note, changeId)
}
class FailDrop(private val repo: DeliveryRepository) {
    suspend operator fun invoke(dropId: String, reason: FailureReason, note: String?, changeId: String) =
        repo.fail(dropId, reason, note, changeId)
}
