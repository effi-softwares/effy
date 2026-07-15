package com.effyshopping.shop.mobile.features.shop.domain

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The role-narrowing (D4s / FR-022). It is UX-only, but it must be TOLERANT (an unknown role the backend
 * adds later maps to nothing, never throws) and it must never invent a MANAGER role that wasn't asserted.
 */
class ShopRolesTest {

    @Test
    fun maps_known_roles() {
        assertEquals(listOf(ShopRole.MANAGER, ShopRole.STAFF), toShopRoles(listOf("shop_manager", "shop_staff")))
    }

    @Test
    fun drops_unknown_roles_without_throwing() {
        assertEquals(listOf(ShopRole.STAFF), toShopRoles(listOf("shop_staff", "district_overlord", "admin")))
    }

    @Test
    fun empty_in_empty_out() {
        assertEquals(emptyList(), toShopRoles(emptyList()))
    }

    @Test
    fun deduplicates() {
        assertEquals(listOf(ShopRole.MANAGER), toShopRoles(listOf("shop_manager", "shop_manager")))
    }

    @Test
    fun never_invents_manager_from_unknown_input() {
        val operator = Operator("sub-1", "op@effy.example", toShopRoles(listOf("owner", "supervisor")), OperatorStatus.ACTIVE, null)
        assertFalse(operator.isManagerByRole)
        assertTrue(operator.roles.isEmpty())
    }

    @Test
    fun manager_by_role_is_true_only_with_the_manager_key() {
        val manager = Operator("s", null, toShopRoles(listOf("shop_manager")), OperatorStatus.ACTIVE, null)
        val staff = Operator("s", null, toShopRoles(listOf("shop_staff")), OperatorStatus.ACTIVE, null)
        assertTrue(manager.isManagerByRole)
        assertFalse(staff.isManagerByRole)
    }
}
