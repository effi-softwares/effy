package com.effyshopping.driver.mobile.features.driver.domain

/**
 * The driver's daily check of the vehicle they hold. [DUE] until answered (no work until then);
 * [unsafe] until a dispatcher clears it; [none] with no vehicle or when the business has the check off.
 */
enum class VehicleCheckStatus { NONE, OK, DUE, UNSAFE }

/** The six things checked, in the order they are asked. */
enum class CheckItem(val label: String) {
    TYRES("Tyres"),
    LIGHTS("Lights and indicators"),
    BRAKES("Brakes"),
    MIRRORS("Mirrors and windows"),
    COLD_STORAGE("Cold storage"),
    BODY("Body damage"),
}

enum class CheckAnswer(val label: String) { OK("OK"), MINOR("Minor issue"), UNSAFE("Unsafe") }

data class VehicleCheckAnswer(val item: CheckItem, val answer: CheckAnswer, val note: String? = null)

class SubmitVehicleCheck(private val repo: DriverRepository) {
    suspend operator fun invoke(changeId: String, answers: List<VehicleCheckAnswer>) = repo.submitVehicleCheck(changeId, answers)
}
