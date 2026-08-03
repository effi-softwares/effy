// GENERATED FROM packages/shared-types/src/customer.ts (+ problem.ts) — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/shared-types contract:gen
// The wire contract lives in TypeScript ONCE (Principle II); this file is derived and diff-guarded.
// NOTE: PasswordWriteDTO is flattened by design (research D15) — the sealed domain type lives in the app.

package com.effyshopping.customer.mobile.contract

import kotlinx.serialization.*
import kotlinx.serialization.json.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*

/**
 * Changing an EXISTING password. Cognito verifies `currentPassword` itself (FR-016).
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
     * ⚠ NEVER null. FR-042 forbids a block that cannot state its own end.
     */
    val clearsAt: String,

    /**
     * Where the customer goes to act on it — FR-042's "direct route". Web routes on this.
     */
    val href: String,

    val kind: ClosureBlockerKind,

    /**
     * Shopper-facing reference, e.g. `EFY-HVX2AE`.
     */
    val reference: String,

    /**
     * Can the customer act on it, or only wait? Both are acceptable; a dead end is not.
     */
    val resolvableByShopper: Boolean,

    /**
     * The same destination in the closed vocabulary mobile needs, having no URL router.
     */
    val target: Target
)

/**
 * Why a customer cannot be deleted yet (034 FR-042).
 *
 * ⚠ THIS REQUIREMENT HAS BEEN WRONG TWICE, so the shape encodes the lesson rather than
 * trusting a comment. First it blocked on any non-terminal order — but an order's only
 * terminal state is a fulfilment reaching `collected`, which ships behind a dev-only stub
 * with no route in any environment, so EVERY customer who had ever paid became permanently
 * undeletable. The fix bounded it at 30 days, matched to the grace period — and that was
 * the same dead end in disguise, because Effy is a WEEKLY-RE-BUY grocery platform: a
 * shopper who buys every week is always within 30 days of an order, so the platform's most
 * engaged customers still could never delete.
 *
 * Hence `clearsAt` is NON-NULLABLE: a blocker that cannot say when it ends is
 * unrepresentable, not merely discouraged.
 */
@Serializable
enum class ClosureBlockerKind(val value: String) {
    @SerialName("order_awaiting_payment") OrderAwaitingPayment("order_awaiting_payment"),
    @SerialName("order_in_transit") OrderInTransit("order_in_transit");
}

/**
 * The same destination in the closed vocabulary mobile needs, having no URL router.
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
 * The step-up challenge for closure — the same masked-destination shape the password flow
 * uses.
 */
@Serializable
data class ClosureChallengeResultDTO (
    val maskedDestination: String
)

/**
 * Everything the customer must see BEFORE any irreversible step (FR-040). Side-effect free.
 */
@Serializable
data class ClosurePreviewDTO (
    /**
     * Present only when a request is already live.
     */
    val activeRequest: ActiveRequest? = null,

    /**
     * Empty ⇒ closure may proceed.
     */
    val blockers: List<ClosureBlockerDTO>,

    /**
     * Advisory until a request actually exists.
     */
    val eraseAfterIfRequestedNow: String,

    val retained: List<RetainedCategoryDTO>
)

@Serializable
data class ActiveRequest (
    val eraseAfter: String,
    val requestedAt: String
)

/**
 * A category of data kept after erasure, and why (FR-045).
 *
 * ⚠ The reason is carried as data, not hardcoded per surface, because SC-010 requires every
 * claim in the disclosure to be TRUE of the built system — and Apple has demanded that
 * developers cite the specific law behind a retention claim. One source, two surfaces, no
 * drift.
 */
@Serializable
data class RetainedCategoryDTO (
    val category: String,
    val reason: String
)

/**
 * Confirming closure. The code is what pays for it (FR-043); a valid session alone may not.
 */
@Serializable
data class ClosureRequestDTO (
    val code: String
)

/**
 * Cancelling a live closure request during the grace window (FR-041a).
 *
 * ⚠ RESTORE IS AN EXPLICIT CALL, never an inference from an authenticated read. Making it
 * implicit is unimplementable — the refusal and the restore run through the SAME identity
 * lookup, so the gate would refuse the very request meant to restore — and unsafe, because
 * anyone holding the customer's token during the window would silently un-delete the
 * account merely by opening the app.
 */
@Serializable
data class ClosureRestoreResultDTO (
    val restoredAt: String
)

@Serializable
data class ClosureResultDTO (
    val allSessionsRevoked: Boolean,

    /**
     * The date the customer is now owed (FR-040).
     */
    val eraseAfter: String
)

/**
 * Where a customer sits in the closure lifecycle (034).
 *
 * `"closing"` means they asked to be deleted and the grace window is running. Every request
 * is refused while it holds — with exactly ONE exception, the explicit restore call
 * (FR-041a).
 *
 * Has this customer asked to be deleted? (034 FR-041.)
 *
 * ⚠ DELIBERATELY NOT a third value of `status`. `status` is a PLATFORM SANCTION, and its
 * entire safety property is that the customer cannot influence it; closure is the
 * customer's OWN decision. Collapsing them would make "barred AND closing" unrepresentable
 * — and FR-049 requires an answer to exactly that case.
 *
 * There is no `"closed"`: once erasure runs, the row is gone. A terminal state would be a
 * row every future read must remember to exclude.
 */
@Serializable
enum class ClosureState(val value: String) {
    @SerialName("closing") Closing("closing"),
    @SerialName("open") Open("open");
}

/**
 * How a customer proved who they are. Telemetry + UI only — never an authorization input.
 */
@Serializable
enum class CredentialRoute(val value: String) {
    @SerialName("google") Google("google"),
    @SerialName("otp") Otp("otp"),
    @SerialName("password") Password("password");
}

/**
 * The platform's own record of a customer — distinct from their Cognito credential, and
 * authoritative for the access decision (FR-025).
 *
 * A `barred` customer is refused no matter how valid their credential is. That is the whole
 * point of holding our own record: the claim is the ORIGIN of identity, the record is the
 * AUTHORITY on access.
 *
 * Note there is no `role` here, and none is coming: the customer pool defines no RBAC
 * groups (constitution Principle IV). That is also a token-size safety measure — id +
 * access + refresh cookies already run to ~4.5 KB against a ~4 KB browser limit, and a
 * fattened claim set would silently truncate the session.
 */
@Serializable
data class CustomerDTO (
    /**
     * Has this customer asked to be deleted? (034 FR-041.)
     *
     * ⚠ DELIBERATELY NOT a third value of `status`. `status` is a PLATFORM SANCTION, and its
     * entire safety property is that the customer cannot influence it; closure is the
     * customer's OWN decision. Collapsing them would make "barred AND closing" unrepresentable
     * — and FR-049 requires an answer to exactly that case.
     *
     * There is no `"closed"`: once erasure runs, the row is gone. A terminal state would be a
     * row every future read must remember to exclude.
     */
    val closureState: ClosureState,

    val createdAt: String,

    /**
     * The verified email. It is the identity key across every credential route.
     */
    val email: String,

    val familyName: String? = null,

    /**
     * First and last name, captured AT REGISTRATION (FR-009a) and mapped 1:1 onto Cognito's
     * standard `given_name` / `family_name` attributes — so they ride on the ID token with no
     * custom claim.
     *
     * Two fields, not one: a delivery label, an order confirmation and a support conversation
     * all need the parts, and a single free-text name cannot be split back into them reliably
     * (ask anyone with two surnames, or one name). Captured at source; never inferred.
     *
     * Nullable because the FEDERATED route supplies whatever the provider asserts, and may
     * assert neither. The platform must not invent a name it was never given.
     */
    val givenName: String? = null,

    /**
     * Does this account have a password? (012 FR-013.)
     *
     * ⚠ THE PLATFORM MUST HOLD THIS ITSELF, because Cognito cannot be asked. There is no API
     * that reports whether a user has a password: `AdminGetUser` does not return it, and
     * `UserStatus` does not distinguish it — a passwordless CONFIRMED user and an
     * email+password CONFIRMED user are identical on the wire (research R5).
     *
     * ⚠ AND IT IS THE ONLY THING THE ACCOUNT PAGE MAY BRANCH ON. Never branch on "how did they
     * sign in": a Google-LINKED customer is an ordinary native user and CAN hold a password.
     * Inferring from the sign-in route would show the wrong control to a real cohort.
     */
    val hasPassword: Boolean,

    val id: String,

    /**
     * When the password last changed. `null` means NEVER — which is a legitimate, complete,
     * permanent state for an email-OTP customer, not a missing value and not an incomplete
     * profile (FR-015).
     */
    val passwordUpdatedAt: String? = null,

    /**
     * A self-asserted contact phone (034 FR-060).
     *
     * ⚠ NEVER VERIFIED by feature 034, and that has two hard consequences (FR-060a): it MUST
     * NOT be rendered with a verified/confirmed indicator, and it MUST NOT be accepted by any
     * identity, recovery or authentication path. There is deliberately no `phoneVerified`
     * companion — a field whose only honest value is `false` is a trap, because someone will
     * eventually render it as a badge.
     *
     * ⚠ DISTINCT from `AddressDTO.phone`, which is the per-address DELIVERY contact a driver
     * calls (FR-060b). This one is a profile convenience; it does not override the address's,
     * and nothing copies one into the other. Two fields disagreeing about who to ring is worse
     * than one gap.
     */
    val phone: String? = null,

    val status: CustomerStatus
)

/**
 * A customer's standing with Effy. PLATFORM-OWNED — never derived from a token claim.
 */
@Serializable
enum class CustomerStatus(val value: String) {
    @SerialName("active") Active("active"),
    @SerialName("barred") Barred("barred");
}

/**
 * The step-up challenge result. It carries a MASKED destination and nothing else — never
 * the full address (an information leak) and obviously never the code.
 */
@Serializable
data class PasswordChallengeResultDTO (
    /**
     * e.g. `j•••@example.com`
     */
    val maskedDestination: String
)

/**
 * Setting a FIRST password. The `code` is what pays for it (FR-017) — a session alone may
 * not.
 *
 * Changing an EXISTING password. Cognito verifies `currentPassword` itself (FR-016).
 */
@Serializable
data class PasswordWriteDTO (
    /**
     * The step-up code, emailed to the account's verified address at the time of the request.
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
 * What the storefront must do after a successful password write.
 *
 * `allSessionsRevoked` is always true (FR-024): Cognito's revocation is all-or-nothing, so
 * a password change ends EVERY session, including the one that made it. The customer is
 * returned to sign-in to prove the new password. See research R7 — and note the window is
 * not zero.
 */
@Serializable
data class PasswordWriteResultDTO (
    val allSessionsRevoked: Boolean,
    val customer: CustomerDTO
)

@Serializable
data class ProblemJSON (
    val detail: String? = null,
    val fields: List<ProblemFieldIssue>? = null,
    val instance: String? = null,
    val status: Double,
    val title: String,
    val type: String
)

/**
 * RFC 9457 problem+json — the platform's single machine-readable error shape (mirrors
 * docs/api/error-envelope.md from 004). Typed ONCE here (Principle II); every web surface
 * consumes it, never re-declares it.
 */
@Serializable
data class ProblemFieldIssue (
    /**
     * The offending field path — or, for a whole-request refusal, a STABLE MACHINE-READABLE
     * CODE.
     *
     * ⚠ 032 uses the second form for delivery-pricing refusals (`cap_below_floor`,
     * `bands_required`, …). "Please check the fields and try again" tells an operator nothing
     * about which of five rules they broke, and every one of those rules fails SILENTLY in
     * production if it is not understood — a cap below the floor makes every delivery cost the
     * cap, forever.
     */
    val field: String,

    val message: String
)

/**
 * Recovery confirm — the "forgot password" completion, moved behind the backend (FR-022b).
 */
@Serializable
data class ResetConfirmDTO (
    val code: String,
    val email: String,
    val newPassword: String
)

/**
 * Setting a FIRST password. The `code` is what pays for it (FR-017) — a session alone may
 * not.
 */
@Serializable
data class SetPasswordDTO (
    /**
     * The step-up code, emailed to the account's verified address at the time of the request.
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
 * What a customer may change about themselves (FR-026).
 *
 * `email` is deliberately absent: changing it is an identity operation, and a customer who
 * can rewrite their own email can walk onto another customer's record (the well-known
 * Cognito takeover). `status` is absent because it is platform-owned. `hasPassword` is
 * absent because it is a CONSEQUENCE of the password endpoints, never an input to them.
 *
 * ⚠ `closureState` IS ABSENT FOR THE SAME REASON AS `status`, and the omission is
 * load-bearing. Closure is written only by the closure endpoints, after a freshly issued
 * verification code. A profile PATCH must never be able to open or close an account — it
 * would turn a routine name edit into an un-delete, and it would bypass the
 * proof-of-control FR-043 exists to demand.
 */
@Serializable
data class UpdateCustomerDTO (
    val familyName: String? = null,
    val givenName: String? = null,

    /**
     * ⚠ Send `""` to CLEAR it, never `null`.
     *
     * The mobile client serialises with `explicitNulls = false`, which drops nulls from the
     * payload entirely — so a `null` phone is indistinguishable from "field not sent" and the
     * clear silently no-ops. The backend maps `""` → `NULL`, on the identical path the name
     * parts already use.
     */
    val phone: String? = null
)
