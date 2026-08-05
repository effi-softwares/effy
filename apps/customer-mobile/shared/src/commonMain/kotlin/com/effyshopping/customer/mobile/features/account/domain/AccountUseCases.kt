package com.effyshopping.customer.mobile.features.account.domain

/**
 * The account domain layer (013). Over the [CustomerRepository] boundary — SessionManager and the
 * Account ViewModel depend on THESE, not the repository directly. Names are trimmed; passwords and codes
 * are passed through untrimmed where the backend owns the meaning (a code is trimmed, a password is not).
 */

/** Read the customer's platform RECORD, creating it idempotently on first appearance. */
class GetCustomer(private val customers: CustomerRepository) {
    suspend operator fun invoke(seedPassword: Boolean = false): Customer = customers.me(seedPassword)
}

/**
 * Change the customer's own details — name and phone (034 FR-060).
 *
 * ⚠ Every field is sent on every call, including the ones that did not change: the backend's PATCH
 * writes the columns it names, so omitting a field would clear it. The caller passes the current
 * value for anything it is not editing.
 */
class UpdateProfile(private val customers: CustomerRepository) {
    suspend operator fun invoke(given: String, family: String, phone: String): Customer =
        customers.updateProfile(given.trim(), family.trim(), phone.trim())
}

/** Email a step-up code for setting a FIRST password (FR-024). Returns the masked destination. */
class RequestPasswordChallenge(private val customers: CustomerRepository) {
    suspend operator fun invoke(): String = customers.requestPasswordChallenge()
}

/** Set a first password with the emailed [code] (FR-024). Revokes every session, including this one. */
class SetPassword(private val customers: CustomerRepository) {
    suspend operator fun invoke(code: String, newPassword: String): Customer =
        customers.setPassword(code.trim(), newPassword)
}

/** Change an existing password; the [current] one is required (FR-025). Revokes every session. */
class ChangePassword(private val customers: CustomerRepository) {
    suspend operator fun invoke(current: String, newPassword: String): Customer =
        customers.changePassword(current, newPassword)
}

/** Sign out on all devices (FR-029). */
class SignOutEverywhere(private val customers: CustomerRepository) {
    suspend operator fun invoke() = customers.signOutEverywhere()
}
