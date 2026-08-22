package com.effyshopping.driver.mobile.features.driver.domain

/** Platform-owned driver lifecycle. A DISABLED driver is refused (Principle IV). */
enum class DriverStatus { ACTIVE, DISABLED }

/** On/off duty — gates whether new work is assigned (FR-005/006). */
enum class DutyStatus { ON_DUTY, OFF_DUTY }

data class Vehicle(val type: String?, val plate: String?)

/**
 * The platform's RECORD of a driver — the authority on access (049 data-model). `zone` may be null
 * (a driver not yet assigned a zone is inert for assignment — research I2). Identity is displayed from
 * the record, never the token (Principle IV).
 */
data class Driver(
    val id: String,
    val name: String,
    val workEmail: String,
    val zone: String?,
    val hub: String?,
    val vehicle: Vehicle,
    val dutyStatus: DutyStatus,
) {
    /** What the shell greets them as — never a raw subject id. */
    val display: String get() = name.trim().ifBlank { workEmail }
}
