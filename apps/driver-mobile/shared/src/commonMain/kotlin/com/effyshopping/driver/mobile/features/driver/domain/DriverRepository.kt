package com.effyshopping.driver.mobile.features.driver.domain

/**
 * The driver's record and duty control (049). Both go to `edge-api/driver` with the access-token
 * bearer. Implementations map wire DTOs to domain and never let a DTO escape; transport failures
 * surface as `AppError` (an `AppException`).
 */
interface DriverRepository {
    /** `GET /driver/v1/me` — the provisioned record. Throws Forbidden if absent/disabled. */
    suspend fun me(): Driver

    /** `POST /driver/v1/duty` — go on/off duty. Returns the resulting driver record (fresh duty state). */
    suspend fun setDuty(onDuty: Boolean, changeId: String): Driver
}
