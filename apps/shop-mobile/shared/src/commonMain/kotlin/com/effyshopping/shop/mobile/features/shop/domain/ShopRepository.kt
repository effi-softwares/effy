package com.effyshopping.shop.mobile.features.shop.domain

/**
 * The operator's record and the manager gate (014 US3/US4). Both go to `edge-api/shop` with the access
 * token bearer. Implementations map wire DTOs to domain and never let a DTO escape; transport failures
 * surface as `AppError` (an `AppException`).
 */
interface ShopRepository {
    /** `GET /shop/v1/me` — record-backed identity + idempotent JIT record. Throws Forbidden if disabled. */
    suspend fun me(): Operator

    /**
     * `GET /shop/v1/manager-ping` — THE authorization decision (FR-023). The BACKEND joins role AND
     * operator status AND active-shop scope. Returns [ManagerAccess.GRANTED] (200) or
     * [ManagerAccess.DENIED] (403, uniform). **Fails closed**: any error → DENIED, never a grant (FR-026).
     */
    suspend fun managerAccess(): ManagerAccess
}

enum class ManagerAccess { GRANTED, DENIED }
