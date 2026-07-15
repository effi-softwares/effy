// GENERATED FROM packages/shared-types/src/shop.ts (+ problem.ts) — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/shared-types contract:gen
// The wire contract lives in TypeScript ONCE (Principle II); this file is derived and diff-guarded.
// NOTE: (shop DTOs: email/shop nullable, roles as List<String> narrowed in the app domain).

package com.effyshopping.shop.mobile.contract

import kotlinx.serialization.*
import kotlinx.serialization.json.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*

/**
 * Shop lifecycle status (009-shop-management). Only `active` shops serve their operators;
 * `suspended` (temporary hold) and `disabled` (deactivated, retained for audit) both refuse.
 */
@Serializable
enum class ShopLifecycleStatus(val value: String) {
    @SerialName("active") Active("active"),
    @SerialName("disabled") Disabled("disabled"),
    @SerialName("suspended") Suspended("suspended");
}

/**
 * Wire DTO for GET /shop/v1/manager-ping (contracts/shop-manager-ping.contract.md).
 */
@Serializable
data class ShopManagerPingDTO (
    val audience: Audience,
    val message: String,
    val scope: Scope,
    val subject: String
)

@Serializable
enum class Audience(val value: String) {
    @SerialName("shop") Shop("shop");
}

@Serializable
enum class Scope(val value: String) {
    @SerialName("shop_manager") ShopManager("shop_manager");
}

/**
 * RFC 9457 problem+json — the platform's single machine-readable error shape (mirrors
 * docs/api/error-envelope.md from 004). Typed ONCE here (Principle II); every web surface
 * consumes it, never re-declares it.
 */
@Serializable
data class ProblemJSON (
    val detail: String? = null,
    val instance: String? = null,
    val status: Double,
    val title: String,
    val type: String
)

/**
 * Shop RBAC roles. Prefixed so `manager` stays unambiguously the back-office role in logs.
 */
@Serializable
enum class ShopRole(val value: String) {
    @SerialName("shop_manager") ShopManager("shop_manager"),
    @SerialName("shop_staff") ShopStaff("shop_staff");
}

/**
 * Wire DTO for the assigned shop, embedded in GET /shop/v1/me.
 */
@Serializable
data class ShopSummaryDTO (
    val code: String,
    val id: String,
    val name: String,
    val status: ShopLifecycleStatus
)

/**
 * Wire DTO for GET /shop/v1/me (contracts/shop-me.contract.md). `email` may be null until
 * provisioning supplies it; `shop` is null for an unassigned operator — an expected state,
 * not an error.
 */
@Serializable
data class ShopStaffRecordDTO (
    val email: String? = null,
    val lastSeenAt: String,
    val roles: List<String>,
    val shop: ShopSummaryDTO? = null,
    val status: ShopStaffStatus,
    val subject: String
)

/**
 * Platform-owned lifecycle. A disabled operator is denied despite an otherwise-valid token.
 */
@Serializable
enum class ShopStaffStatus(val value: String) {
    @SerialName("active") Active("active"),
    @SerialName("disabled") Disabled("disabled");
}
