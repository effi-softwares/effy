package com.effyshopping.customer.mobile.features.account.domain

/**
 * The account domain layer. Over the [CustomerRepository] boundary - SessionManager and the
 * Account ViewModel depend on these, not the repository directly. Names are trimmed; passwords and codes
 * are passed through untrimmed where the backend owns the meaning (a code is trimmed, a password is not).
 */

/** Read the customer's platform record, creating it idempotently on first appearance. */
class GetCustomer(private val customers: CustomerRepository) {
    suspend operator fun invoke(seedPassword: Boolean = false): Customer = customers.me(seedPassword)
}

/**
 * Change the customer's own details - name and phone.
 *
 * Every field is sent on every call, including the ones that did not change: the backend's PATCH
 * writes the columns it names, so omitting a field would clear it. The caller passes the current
 * value for anything it is not editing.
 */
class UpdateProfile(private val customers: CustomerRepository) {
    suspend operator fun invoke(given: String, family: String, phone: String): Customer =
        customers.updateProfile(given.trim(), family.trim(), phone.trim())
}

/** Email a step-up code for setting a first password. Returns the masked destination. */
class RequestPasswordChallenge(private val customers: CustomerRepository) {
    suspend operator fun invoke(): String = customers.requestPasswordChallenge()
}

/** Set a first password with the emailed [code]. Revokes every session, including this one. */
class SetPassword(private val customers: CustomerRepository) {
    suspend operator fun invoke(code: String, newPassword: String): Customer =
        customers.setPassword(code.trim(), newPassword)
}

/** Change an existing password; the [current] one is required. Revokes every session. */
class ChangePassword(private val customers: CustomerRepository) {
    suspend operator fun invoke(current: String, newPassword: String): Customer =
        customers.changePassword(current, newPassword)
}

/** Sign out on all devices. */
class SignOutEverywhere(private val customers: CustomerRepository) {
    suspend operator fun invoke() = customers.signOutEverywhere()
}
