package com.effyshopping.driver.mobile.features.today.domain

/** The phase-aware home read (049). Goes to `edge-api/driver` with the access-token bearer. */
interface TodayRepository {
    /** `GET /driver/v1/today`. */
    suspend fun today(): Today
}

/** Read the driver's current phase, active work, and remaining count. */
class GetToday(private val repository: TodayRepository) {
    suspend operator fun invoke(): Today = repository.today()
}
