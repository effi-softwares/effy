package com.effyshopping.customer.mobile.features.account.data

import com.effyshopping.customer.mobile.contract.CustomerDTO
import com.effyshopping.customer.mobile.contract.CustomerStatus
import com.effyshopping.customer.mobile.features.account.domain.Customer
import com.effyshopping.customer.mobile.features.account.domain.CustomerName
import com.effyshopping.customer.mobile.features.account.domain.CustomerStanding

/** DTO → domain. The DTO never escapes the data layer (Principle VI). */
internal fun CustomerDTO.toDomain(): Customer = Customer(
    id = id,
    email = email,
    name = CustomerName(given = givenName, family = familyName),
    standing = when (status) {
        CustomerStatus.Active -> CustomerStanding.ACTIVE
        CustomerStatus.Barred -> CustomerStanding.BARRED
    },
    hasPassword = hasPassword,
    passwordSetAtIso = passwordUpdatedAt,
    createdAtIso = createdAt,
)
