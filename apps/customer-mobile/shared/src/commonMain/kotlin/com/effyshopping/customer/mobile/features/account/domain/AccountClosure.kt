package com.effyshopping.customer.mobile.features.account.domain

/**
 * Account closure — the domain shapes behind in-app account deletion (034 US3).
 *
 * ⚠ The word is DELETE, everywhere and always. Nothing here offers to deactivate, disable, freeze or
 * pause an account, and no such state is reachable: both documented App Review rejections in this
 * area were deactivation flows with a support agent in the loop, and that is the specific shape that
 * fails. Erasure runs automatically once requested.
 */

/** Why closure is blocked. Only conditions the platform ACTUALLY models may appear (FR-042a). */
enum class ClosureBlockerKind {
    /** Checkout started, money not taken. The shopper resolves this themselves, in-app. */
    ORDER_AWAITING_PAYMENT,

    /** Paid, goods plausibly still in transit. Clears on fulfilment or after a short bound. */
    ORDER_IN_TRANSIT,
}

/**
 * One obligation standing between the shopper and deletion.
 *
 * ⚠ [clearsAtIso] IS NON-NULL BY CONSTRUCTION. FR-042 forbids a block that cannot state when it
 * ends, and this requirement has been wrong twice — first blocking forever on any unfulfilled order,
 * then bounding it at 30 days, which on a weekly-re-buy grocery platform still meant the most active
 * shoppers could never delete. A blocker that cannot say when it ends is unrepresentable here.
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

/** A category of data kept after erasure, and the reason — carried as DATA so it cannot drift. */
data class RetainedCategory(val category: String, val reason: String)

/** Everything the shopper must see BEFORE any irreversible step (FR-040). */
data class ClosurePreview(
    val blockers: List<ClosureBlocker>,
    val retained: List<RetainedCategory>,
    val eraseAfterIfRequestedNowIso: String,
    val activeRequest: ActiveClosureRequest?,
) {
    val canProceed: Boolean get() = blockers.isEmpty() && activeRequest == null
}

data class ActiveClosureRequest(val requestedAtIso: String, val eraseAfterIso: String)

/** The account-closure operations. Cold path, like every other account capability. */
interface ClosureRepository {
    /** Read-only and side-effect free — safe to call on entry and again before confirming. */
    suspend fun preview(): ClosurePreview

    /** Email the step-up code closure costs (FR-043). Returns the masked destination. */
    suspend fun requestCode(): String

    /** Verify the code and close. Every session ends. Returns the date erasure becomes irreversible. */
    suspend fun close(code: String): String

    /** Cancel a pending deletion during the grace window (FR-041a). */
    suspend fun restore()
}

// ── Use cases ─────────────────────────────────────────────────────────────────────────────────

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
