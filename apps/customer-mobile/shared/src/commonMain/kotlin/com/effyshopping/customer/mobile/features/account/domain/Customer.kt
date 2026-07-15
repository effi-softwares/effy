package com.effyshopping.customer.mobile.features.account.domain

/** A customer's standing with Effy. PLATFORM-OWNED — never derived from a token claim (013 FR-033). */
enum class CustomerStanding { ACTIVE, BARRED }

/**
 * The platform's own record of a customer (013 data-model § 2). The authority on their name, email,
 * standing, and whether the account has a password — none of which is read from the credential.
 */
data class Customer(
    val id: String,
    val email: String,
    val name: CustomerName,
    val standing: CustomerStanding,
    val hasPassword: Boolean,
    val passwordSetAtIso: String?, // null = never (a permanent, first-class state)
    val createdAtIso: String,
) {
    val isBarred: Boolean get() = standing == CustomerStanding.BARRED

    /** Which password journey the account page offers — derived ONLY from [hasPassword] (FR-024/FR-025). */
    val passwordJourney: PasswordJourney
        get() = if (hasPassword) PasswordJourney.CHANGE else PasswordJourney.SET
}

enum class PasswordJourney { SET, CHANGE }

/**
 * A customer's name, and the two derived display values. Two nullable parts because a federated
 * identity may assert neither, and the platform must not invent a name it was never given (FR-022).
 */
data class CustomerName(
    val given: String?,
    val family: String?,
) {
    /** "Ada Lovelace" · "Ada" · "" — computed, never stored. */
    val display: String
        get() = listOfNotNull(given?.trim()?.ifBlank { null }, family?.trim()?.ifBlank { null })
            .joinToString(" ")

    /** The initials for the avatar. See [initials] — the ONE place initials are derived (SC-013). */
    val initials: String get() = initialsFor(given, family)
}
