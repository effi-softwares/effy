// GENERATED FROM packages/shared-types/src/customer.ts (+ problem.ts) - DO NOT EDIT.
// Regenerate: pnpm --filter @effy/shared-types contract:gen
// The wire contract lives in TypeScript ONCE (Principle II); this file is derived and diff-guarded.
// NOTE: PasswordWriteDTO is flattened by design (research D15) - the sealed domain type lives in the app.

package com.effyshopping.customer.mobile.contract

import kotlinx.serialization.*
import kotlinx.serialization.json.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*

/**
 * Changing an existing password; Cognito verifies `currentPassword`.
 */
@Serializable
data class ChangePasswordDTO (
    val currentPassword: String,
    val mode: ChangePasswordMode,
    val newPassword: String
)

@Serializable
enum class ChangePasswordMode(val value: String) {
    @SerialName("change") Change("change");
}

@Serializable
data class ClosureBlockerDTO (
    /**
     * Never null.
     */
    val clearsAt: String,

    /**
     * Where the customer goes to act on it (web).
     */
    val href: String,

    val kind: ClosureBlockerKind,

    /**
     * Shopper-facing reference, e.g. `EFY-HVX2AE`.
     */
    val reference: String,

    /**
     * Whether the customer can act on it, or only wait.
     */
    val resolvableByShopper: Boolean,

    /**
     * The same destination as a closed vocabulary (mobile has no URL router).
     */
    val target: Target
)

/**
 * Why a customer cannot be deleted yet. Every blocker must say when it clears (`clearsAt`
 * is non-nullable): earlier rules left frequent shoppers permanently undeletable.
 */
@Serializable
enum class ClosureBlockerKind(val value: String) {
    @SerialName("order_awaiting_payment") OrderAwaitingPayment("order_awaiting_payment"),
    @SerialName("order_in_transit") OrderInTransit("order_in_transit");
}

/**
 * The same destination as a closed vocabulary (mobile has no URL router).
 */
@Serializable
data class Target (
    val id: String,
    val kind: Kind
)

@Serializable
enum class Kind(val value: String) {
    @SerialName("order") Order("order");
}

/**
 * The step-up challenge for closure (the password flow's masked-destination shape).
 */
@Serializable
data class ClosureChallengeResultDTO (
    val maskedDestination: String
)

/**
 * Everything the customer sees before any irreversible step. Side-effect free.
 */
@Serializable
data class ClosurePreviewDTO (
    /**
     * Present only when a request is already live.
     */
    val activeRequest: ActiveRequest? = null,

    /**
     * Empty: closure may proceed.
     */
    val blockers: List<ClosureBlockerDTO>,

    /**
     * Advisory until a request actually exists.
     */
    val eraseAfterIfRequestedNow: String,

    /**
     * The points lost when closure becomes final, and their value, told before confirming.
     */
    val pointsHeld: Long? = null,

    val pointsValueAmount: String? = null,
    val retained: List<RetainedCategoryDTO>
)

@Serializable
data class ActiveRequest (
    val eraseAfter: String,
    val requestedAt: String
)

/**
 * A category of data kept after erasure, and why, carried as data so every surface states
 * the same true reason.
 */
@Serializable
data class RetainedCategoryDTO (
    val category: String,
    val reason: String
)

/**
 * Confirming closure: the code pays for it; a session alone may not.
 */
@Serializable
data class ClosureRequestDTO (
    val code: String
)

/**
 * Cancels a live closure during the grace window. An explicit call, never inferred from a
 * read: the gate would refuse it, and any holder of the token would un-delete the account
 * by opening the app.
 */
@Serializable
data class ClosureRestoreResultDTO (
    val restoredAt: String
)

@Serializable
data class ClosureResultDTO (
    val allSessionsRevoked: Boolean,

    /**
     * The date the customer is now owed.
     */
    val eraseAfter: String
)

/**
 * Where a customer is in closure. `"closing"`: the grace window is running and every
 * request is refused except restore.
 *
 * Has this customer asked to be deleted? Not a value of `status`, which is a platform
 * sanction the customer cannot influence (a customer can be barred and closing). No
 * `"closed"`: erasure removes the row.
 */
@Serializable
enum class ClosureState(val value: String) {
    @SerialName("closing") Closing("closing"),
    @SerialName("open") Open("open");
}

/**
 * How a customer proved who they are. Telemetry and UI only, never an authorization input.
 */
@Serializable
enum class CredentialRoute(val value: String) {
    @SerialName("google") Google("google"),
    @SerialName("otp") Otp("otp"),
    @SerialName("password") Password("password");
}

/**
 * The platform's own record of a customer, authoritative for access: a `barred` customer is
 * refused whatever their credential. No `role`: the customer pool has no groups (which also
 * keeps the session cookies under the browser's size limit).
 */
@Serializable
data class CustomerDTO (
    /**
     * Has this customer asked to be deleted? Not a value of `status`, which is a platform
     * sanction the customer cannot influence (a customer can be barred and closing). No
     * `"closed"`: erasure removes the row.
     */
    val closureState: ClosureState,

    val createdAt: String,

    /**
     * The verified email: the identity key across every credential route.
     */
    val email: String,

    /**
     * How reliably the platform can reach this email. Authenticated surfaces only: on a sign-in
     * screen it would reveal whether an address has an account. `"reachable"` when nothing is
     * known. No reason or diagnostic (those stay in back-office).
     */
    val emailDelivery: EmailDeliveryState,

    val familyName: String? = null,

    /**
     * First and last name, captured at registration and mapped onto Cognito's `given_name` /
     * `family_name`. Nullable: a federated provider may assert neither, and no name is invented.
     */
    val givenName: String? = null,

    /**
     * Does this account have a password? The platform holds it because Cognito cannot be asked.
     * The account page branches on this only, never on how the customer signed in.
     */
    val hasPassword: Boolean,

    val id: String,

    /**
     * When the password last changed; `null` means never, a complete state for an email-code
     * customer.
     */
    val passwordUpdatedAt: String? = null,

    /**
     * A self-asserted contact phone, never verified: never shown with a verified mark and never
     * accepted by any identity or recovery path (so there is no `phoneVerified`). Distinct from
     * `AddressDTO.phone`, the per-address delivery contact; neither overrides the other.
     */
    val phone: String? = null,

    val status: CustomerStatus
)

/**
 * How reliably the platform can reach this email. Authenticated surfaces only: on a sign-in
 * screen it would reveal whether an address has an account. `"reachable"` when nothing is
 * known. No reason or diagnostic (those stay in back-office).
 *
 * The platform's conclusion about reaching an address, from per-message outcomes (a
 * successful `SendEmail` proves nothing):
 * - `reachable` the last outcome was a delivery, or nothing is known.
 * - `soft_failing` a transient failure; informational, gates nothing.
 * - `undeliverable` a permanent failure; a lockout for the passwordless audiences.
 * - `complained` marked as spam; surfaced, but never bars sign-in (it usually means someone
 * typed  a stranger's address).
 */
@Serializable
enum class EmailDeliveryState(val value: String) {
    @SerialName("complained") Complained("complained"),
    @SerialName("reachable") Reachable("reachable"),
    @SerialName("soft_failing") SoftFailing("soft_failing"),
    @SerialName("undeliverable") Undeliverable("undeliverable");
}

/**
 * A customer's standing with Effy: platform-owned, never derived from a token claim.
 */
@Serializable
enum class CustomerStatus(val value: String) {
    @SerialName("active") Active("active"),
    @SerialName("barred") Barred("barred");
}

/**
 * GET /customer/v1/points: the balance and a page of history in one answer (every points
 * screen shows both). `?cursor=` pages it.
 */
@Serializable
data class CustomerPointsDTO (
    val centsPerPoint: Long,
    val history: PointsHistoryPageDTO,

    /**
     * The soonest lot to expire; null when nothing is due.
     */
    val nextExpiry: CustomerPointsNextExpiry? = null,

    val points: Long,
    val valueAmount: String
)

@Serializable
data class PointsHistoryPageDTO (
    val entries: List<PointsHistoryEntryDTO>,

    /**
     * Absent on the last page.
     */
    val nextCursor: String? = null
)

/**
 * One history line as the customer sees it.
 */
@Serializable
data class PointsHistoryEntryDTO (
    val at: String,

    /**
     * Credits only: the last date these points can be used (yyyy-mm-dd, Melbourne).
     */
    val expiresOn: String? = null,

    val id: String,
    val kind: PointsEntryKind,
    val orderNumber: String? = null,

    /**
     * Signed.
     */
    val points: Long,

    val valueAmount: String,

    /**
     * The sentence to show, decided by the server from the reason.
     */
    val words: String
)

/**
 * Every kind of change to a balance. Credits are positive, debits negative.
 */
@Serializable
enum class PointsEntryKind(val value: String) {
    @SerialName("auto_credit") AutoCredit("auto_credit"),
    @SerialName("expired") Expired("expired"),
    @SerialName("forfeited") Forfeited("forfeited"),
    @SerialName("returned") Returned("returned"),
    @SerialName("spent") Spent("spent"),
    @SerialName("staff_credit") StaffCredit("staff_credit"),
    @SerialName("staff_debit") StaffDebit("staff_debit");
}

@Serializable
data class CustomerPointsNextExpiry (
    val date: String,
    val points: Long
)

/**
 * The step-up result: a masked destination only, never the address or the code.
 */
@Serializable
data class PasswordChallengeResultDTO (
    /**
     * e.g. `j•••@example.com`
     */
    val maskedDestination: String
)

/**
 * Setting a first password: the code pays for it; a session alone may not.
 *
 * Changing an existing password; Cognito verifies `currentPassword`.
 */
@Serializable
data class PasswordWriteDTO (
    /**
     * The step-up code, emailed to the account's verified address.
     */
    val code: String? = null,

    val mode: PasswordWriteDTOMode,
    val newPassword: String,
    val currentPassword: String? = null
)

@Serializable
enum class PasswordWriteDTOMode(val value: String) {
    @SerialName("change") Change("change"),
    @SerialName("set") Set("set");
}

/**
 * After a password write every session is revoked (Cognito's revocation is all-or-nothing),
 * this one included.
 */
@Serializable
data class PasswordWriteResultDTO (
    val allSessionsRevoked: Boolean,
    val customer: CustomerDTO
)

/**
 * GET /customer/v1/points
 */
@Serializable
data class PointsBalanceDTO (
    val centsPerPoint: Long,

    /**
     * The soonest lot to expire; null when nothing is due.
     */
    val nextExpiry: PointsBalanceNextExpiry? = null,

    val points: Long,
    val valueAmount: String
)

@Serializable
data class PointsBalanceNextExpiry (
    val date: String,
    val points: Long
)

@Serializable
data class ProblemJSON (
    /**
     * A stable refusal code where the route defines one (e.g. `slot_required`), mapped by the
     * client to its own copy; `detail` is prose.
     */
    val code: String? = null,

    val detail: String? = null,

    /**
     * Field issues (the wire key is `errors`).
     */
    val errors: List<ProblemFieldIssue>? = null,

    val instance: String? = null,
    val status: Double,
    val title: String,
    val type: String
)

/**
 * RFC 9457 problem+json: the platform's one machine-readable error shape.
 */
@Serializable
data class ProblemFieldIssue (
    /**
     * The offending field path, or for a whole-request refusal a stable machine-readable code
     * (e.g. `cap_below_floor`, `bands_required`), so the client can say which rule was broken.
     */
    val field: String,

    val message: String
)

/**
 * Completes "forgot password" through the backend.
 */
@Serializable
data class ResetConfirmDTO (
    val code: String,
    val email: String,
    val newPassword: String
)

/**
 * Setting a first password: the code pays for it; a session alone may not.
 */
@Serializable
data class SetPasswordDTO (
    /**
     * The step-up code, emailed to the account's verified address.
     */
    val code: String,

    val mode: SetPasswordMode,
    val newPassword: String
)

@Serializable
enum class SetPasswordMode(val value: String) {
    @SerialName("set") Set("set");
}

/**
 * What a customer may change about themselves. No `email` (an identity operation), `status`
 * (platform-owned), `hasPassword` (a consequence of the password routes) or `closureState`
 * (only the closure routes write it, after a fresh code).
 */
@Serializable
data class UpdateCustomerDTO (
    val familyName: String? = null,
    val givenName: String? = null,

    /**
     * Send `""` to clear, never `null`: the mobile client drops nulls, so `null` reads as "not
     * sent".
     */
    val phone: String? = null
)
