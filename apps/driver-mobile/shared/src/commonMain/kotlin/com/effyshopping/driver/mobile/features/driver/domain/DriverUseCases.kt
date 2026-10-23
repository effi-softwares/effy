package com.effyshopping.driver.mobile.features.driver.domain

/**
 * Driver identity + duty use cases. Over the [DriverRepository] boundary — SessionManager and the
 * ViewModels depend on these, not the repository directly (Principle VI).
 */

/** Read the driver's platform record (identity + zone + hub + vehicle + duty). Throws on refusal. */
class GetDriverIdentity(private val repository: DriverRepository) {
    suspend operator fun invoke(): Driver = repository.me()

    /** The last record read, for opening the app with no signal (backlog C3). */
    fun lastKnown(): Driver? = repository.lastKnown()
}

/** Go on/off duty. A per-action [changeId] makes a retried request idempotent. */
class SetDuty(private val repository: DriverRepository) {
    suspend operator fun invoke(onDuty: Boolean, changeId: String): Driver =
        repository.setDuty(onDuty, changeId)
}
