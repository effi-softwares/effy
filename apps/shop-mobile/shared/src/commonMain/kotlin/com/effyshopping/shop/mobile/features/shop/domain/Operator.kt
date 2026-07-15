package com.effyshopping.shop.mobile.features.shop.domain

/** A shop operator's role. Narrowed from the record's `roles` — an unknown role maps to nothing (D4s). */
enum class ShopRole(val key: String) { MANAGER("shop_manager"), STAFF("shop_staff") }

/** Platform-owned operator lifecycle. A DISABLED operator is refused (FR-030). */
enum class OperatorStatus { ACTIVE, DISABLED }

/** Shop lifecycle (009). Only ACTIVE serves; SUSPENDED and DISABLED both refuse. */
enum class ShopLifecycle { ACTIVE, SUSPENDED, DISABLED }

data class AssignedShop(val id: String, val code: String, val name: String, val lifecycle: ShopLifecycle)

/**
 * The platform's RECORD of an operator — the authority on access (014 data-model § 2). `email` and
 * `shop` may be null (expected, in-progress states — FR-021). [isManagerByRole] decides WHAT the UI
 * offers; it NEVER decides WHAT the platform allows — that is the manager gate (the backend).
 */
data class Operator(
    val subject: String,
    val email: String?,
    val roles: List<ShopRole>,
    val status: OperatorStatus,
    val shop: AssignedShop?,
) {
    /** UX ONLY — hides manager controls from non-managers. Never the guard (FR-022/FR-023). */
    val isManagerByRole: Boolean get() = roles.contains(ShopRole.MANAGER)

    /** What the shell greets them as — never a raw subject id (FR-021). */
    val display: String get() = email?.trim()?.ifBlank { null } ?: "Operator"
}

/**
 * Tolerant reader: a role the backend adds later maps to nothing rather than throwing (D4s). This is
 * DOMAIN logic — not in the generated DTO — so the wire `roles: List<String>` is narrowed here.
 */
fun toShopRoles(input: List<String>): List<ShopRole> =
    input.mapNotNull { raw -> ShopRole.entries.firstOrNull { it.key == raw } }.distinct()
