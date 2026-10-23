package com.effyshopping.customer.mobile.features.account.domain

/**
 * Account closure — the domain shapes behind in-app account deletion.
 *
 * The word is DELETE, everywhere and always. Nothing here offers to deactivate, disable, freeze or
 * pause an account, and no such state is reachable: both documented App Review rejections in this
 * area were deactivation flows with a support agent in the loop, and that is the specific shape that
 * fails. Erasure runs automatically once requested.
 */

/** Why closure is blocked. Only conditions the platform actually models may appear. */
enum class ClosureBlockerKind {
    /** Checkout started, money not taken. The shopper resolves this themselves, in-app. */
    ORDER_AWAITING_PAYMENT,

    /** Paid, goods plausibly still in transit. Clears on fulfilment or after a short bound. */
    ORDER_IN_TRANSIT,
}

/**
 * One obligation standing between the shopper and deletion. [clearsAtIso] is non-null by construction: a
 * blocker that cannot say when it ends is unrepresentable.
 */
data class ClosureBlocker(
    val kind: ClosureBlockerKind,
    val reference: String,
    val orderId: String,
    val clearsAtIso: String,
    val resolvableByShopper: Boolean,
) {
    /** What the shopper is told, in one sentence they can act on. */
    val sentence: String
        get() = when (kind) {
            ClosureBlockerKind.ORDER_AWAITING_PAYMENT ->
                "Order $reference is waiting for payment. Finish or cancel it, then you can delete your account."
            ClosureBlockerKind.ORDER_IN_TRANSIT ->
                "Order $reference is on its way. You'll be able to delete your account once it's complete."
        }
}

/** A category of data kept after erasure, and the reason — carried as data so it cannot drift. */
data class RetainedCategory(val category: String, val reason: String)

/** Everything the shopper must see before any irreversible step. */
data class ClosurePreview(
    val blockers: List<ClosureBlocker>,
    val retained: List<RetainedCategory>,
    val eraseAfterIfRequestedNowIso: String,
    val activeRequest: ActiveClosureRequest?,
    /** Points the customer would lose, and their value. Null when there are none. */
    val pointsHeld: Long? = null,
    val pointsValueAmount: String? = null,
) {
    val canProceed: Boolean get() = blockers.isEmpty() && activeRequest == null
}

data class ActiveClosureRequest(val requestedAtIso: String, val eraseAfterIso: String)

/** The account-closure operations. Cold path, like every other account capability. */
interface ClosureRepository {
    /** Read-only and side-effect free — safe to call on entry and again before confirming. */
    suspend fun preview(): ClosurePreview

    /** Email the step-up code closure costs. Returns the masked destination. */
    suspend fun requestCode(): String

    /** Verify the code and close. Every session ends. Returns the date erasure becomes irreversible. */
    suspend fun close(code: String): String

    /** Cancel a pending deletion during the grace window. */
    suspend fun restore()
}

// Use cases

class PreviewAccountClosure(private val closures: ClosureRepository) {
    suspend operator fun invoke(): ClosurePreview = closures.preview()
}

class RequestClosureCode(private val closures: ClosureRepository) {
    suspend operator fun invoke(): String = closures.requestCode()
}

class CloseAccount(private val closures: ClosureRepository) {
    suspend operator fun invoke(code: String): String = closures.close(code.trim())
}

class RestoreAccount(private val closures: ClosureRepository) {
    suspend operator fun invoke() = closures.restore()
}
