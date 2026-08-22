package com.effyshopping.driver.mobile.features.driver.domain

/**
 * Driver identity + duty use cases (049). Over the [DriverRepository] boundary — SessionManager and the
 * ViewModels depend on THESE, not the repository directly (Principle VI).
 */

/** Read the driver's platform RECORD (identity + zone + hub + vehicle + duty). Throws on refusal. */
class GetDriverIdentity(private val repository: DriverRepository) {
    suspend operator fun invoke(): Driver = repository.me()
}

/** Go on/off duty (FR-005/006). A per-action [changeId] makes a retried request idempotent (R10). */
class SetDuty(private val repository: DriverRepository) {
    suspend operator fun invoke(onDuty: Boolean, changeId: String): Driver =
        repository.setDuty(onDuty, changeId)
}
