package com.effyshopping.customer.mobile.features.account.domain

/** A customer's standing with Effy. Platform-owned - never derived from a token claim. */
enum class CustomerStanding { ACTIVE, BARRED }

/**
 * The platform's own record of a customer (013 data-model § 2). The authority on their name, email,
 * standing, and whether the account has a password - none of which is read from the credential.
 */
data class Customer(
    val id: String,
    val email: String,
    val name: CustomerName,
    /**
     * A self-asserted contact phone: never verified, never on an identity or recovery path, and with no
     * `phoneVerified` companion. Distinct from a delivery address's phone, which a driver calls.
     */
    val phone: String?,
    val standing: CustomerStanding,
    val hasPassword: Boolean,
    val passwordSetAtIso: String?, // null = never (a permanent, first-class state)
    val createdAtIso: String,
) {
    val isBarred: Boolean get() = standing == CustomerStanding.BARRED

    /** Which password journey the account page offers - derived only from [hasPassword]. */
    val passwordJourney: PasswordJourney
        get() = if (hasPassword) PasswordJourney.CHANGE else PasswordJourney.SET
}

enum class PasswordJourney { SET, CHANGE }

/**
 * A customer's name, and the two derived display values. Two nullable parts because a federated
 * identity may assert neither, and the platform must not invent a name it was never given.
 */
data class CustomerName(
    val given: String?,
    val family: String?,
) {
    /** "Ada Lovelace" · "Ada" · "" - computed, never stored. */
    val display: String
        get() = listOfNotNull(given?.trim()?.ifBlank { null }, family?.trim()?.ifBlank { null })
            .joinToString(" ")

    /** The initials for the avatar. See [initials] - the one place initials are derived. */
    val initials: String get() = initialsFor(given, family)
}
