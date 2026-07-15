package com.effyshopping.shop.mobile.features.shop.data

import com.effyshopping.shop.mobile.contract.ShopLifecycleStatus
import com.effyshopping.shop.mobile.contract.ShopStaffRecordDTO
import com.effyshopping.shop.mobile.contract.ShopStaffStatus
import com.effyshopping.shop.mobile.contract.ShopSummaryDTO
import com.effyshopping.shop.mobile.features.shop.domain.AssignedShop
import com.effyshopping.shop.mobile.features.shop.domain.Operator
import com.effyshopping.shop.mobile.features.shop.domain.OperatorStatus
import com.effyshopping.shop.mobile.features.shop.domain.ShopLifecycle
import com.effyshopping.shop.mobile.features.shop.domain.toShopRoles

/** DTO → domain. The DTO never escapes the data layer (Principle VI). `roles` are narrowed here (D4s). */
internal fun ShopStaffRecordDTO.toDomain(): Operator = Operator(
    subject = subject,
    email = email,                                     // null = not provisioned yet (expected, FR-021)
    roles = toShopRoles(roles),                        // unknown role dropped (tolerant, domain logic)
    status = when (status) {
        ShopStaffStatus.Active -> OperatorStatus.ACTIVE
        ShopStaffStatus.Disabled -> OperatorStatus.DISABLED
    },
    shop = shop?.toDomain(),                            // null = unassigned (expected, FR-021)
)

private fun ShopSummaryDTO.toDomain(): AssignedShop = AssignedShop(
    id = id,
    code = code,
    name = name,
    lifecycle = when (status) {
        ShopLifecycleStatus.Active -> ShopLifecycle.ACTIVE
        ShopLifecycleStatus.Suspended -> ShopLifecycle.SUSPENDED
        ShopLifecycleStatus.Disabled -> ShopLifecycle.DISABLED
    },
)
