package com.effyshopping.customer.mobile.features.account.domain

/**
 * The customer's own record and account operations. All calls go to the cold path
 * (`edge-api/customer`) per the routing law. Implementations map wire DTOs to [Customer] and never let
 * a DTO escape; transport failures surface as `AppError` (an `AppException`).
 */
interface CustomerRepository {

    /**
     * Read the platform's record, creating it idempotently on first appearance. [seedPassword]
     * = true sends `?route=password` so a just-registered password customer seeds `has_password` — it is
     * honoured only on the creating call, and is a UX hint, never authorization.
     * Throws `AppException(Forbidden)` for a barred customer.
     */
    suspend fun me(seedPassword: Boolean = false): Customer

    /**
     * Change what is the customer's to change — the name and the phone.
     *
     * Pass `""` to clear a field, never `null`. `explicitNulls = false` drops nulls from the
     * payload entirely, so a null is indistinguishable from "not sent" and the clear silently
     * no-ops. The backend maps empty → null.
     */
    suspend fun updateProfile(given: String?, family: String?, phone: String?): Customer

    /** Email a step-up code for setting a first password. Returns the masked destination. */
    suspend fun requestPasswordChallenge(): String

    /** Set a first password with the emailed [code]. Every session is revoked, including this one. */
    suspend fun setPassword(code: String, newPassword: String): Customer

    /** Change an existing password; the [current] one is required. Every session is revoked. */
    suspend fun changePassword(current: String, newPassword: String): Customer

    /** Sign out on all devices. Not instant — other devices' tokens last up to their expiry. */
    suspend fun signOutEverywhere()

    /** Finish account recovery via the backend — not the SDK, which would corrupt has_password. */
    suspend fun confirmPasswordReset(email: String, code: String, newPassword: String)
}
