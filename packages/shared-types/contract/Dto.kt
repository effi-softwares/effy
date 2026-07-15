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

/**
 * RFC 9457 problem+json — the platform's single machine-readable error shape (mirrors
 * docs/api/error-envelope.md from 004). Typed ONCE here (Principle II); every web surface
 * consumes it, never re-declares it.
 */
@Serializable
data class ProblemJSON (
    val detail: String? = null,
    val instance: String? = null,
    val status: Double,
    val title: String,
    val type: String
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
 */
@Serializable
data class UpdateCustomerDTO (
    val familyName: String? = null,
    val givenName: String? = null
)
