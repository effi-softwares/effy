package com.effyshopping.customer.mobile.features.account.domain

/**
 * The customer's own record and account operations (013 US4/US5). All calls go to the cold path
 * (`edge-api/customer`) per the routing law. Implementations map wire DTOs to [Customer] and never let
 * a DTO escape; transport failures surface as `AppError` (an `AppException`).
 */
interface CustomerRepository {

    /**
     * Read the platform's record, creating it idempotently on first appearance (FR-031). [seedPassword]
     * = true sends `?route=password` so a just-registered password customer seeds `has_password` — it is
     * honoured only on the creating call, and is a UX hint, never authorization.
     * Throws `AppException(Forbidden)` for a barred customer (FR-033).
     */
    suspend fun me(seedPassword: Boolean = false): Customer

    /** Change the display name (FR-023). Returns the updated record. */
    suspend fun updateName(given: String?, family: String?): Customer

    /** Email a step-up code for setting a FIRST password (FR-024). Returns the masked destination. */
    suspend fun requestPasswordChallenge(): String

    /** Set a first password with the emailed [code] (FR-024). Every session is revoked, including this one. */
    suspend fun setPassword(code: String, newPassword: String): Customer

    /** Change an existing password; the [current] one is required (FR-025). Every session is revoked. */
    suspend fun changePassword(current: String, newPassword: String): Customer

    /** Sign out on all devices (FR-029). Not instant — other devices' tokens last up to their expiry. */
    suspend fun signOutEverywhere()

    /** Finish account recovery via the backend (FR-015) — NOT the SDK, which would corrupt has_password. */
    suspend fun confirmPasswordReset(email: String, code: String, newPassword: String)
}
