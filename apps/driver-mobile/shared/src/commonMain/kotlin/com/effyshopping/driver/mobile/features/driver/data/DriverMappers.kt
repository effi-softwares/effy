package com.effyshopping.driver.mobile.features.driver.data

import com.effyshopping.driver.mobile.contract.DriverDutyStatus
import com.effyshopping.driver.mobile.contract.DriverMeDTO
import com.effyshopping.driver.mobile.contract.DriverVehicle
import com.effyshopping.driver.mobile.features.driver.domain.Driver
import com.effyshopping.driver.mobile.features.driver.domain.DutyStatus
import com.effyshopping.driver.mobile.features.driver.domain.Vehicle

/** DTO → domain. The DTO never escapes the data layer (Principle VI). */
internal fun DriverMeDTO.toDomain(): Driver = Driver(
    id = id,
    name = name,
    workEmail = workEmail,
    zone = zone,
    hub = hub,
    vehicle = vehicle.toDomain(),
    dutyStatus = when (dutyStatus) {
        DriverDutyStatus.OnDuty -> DutyStatus.ON_DUTY
        DriverDutyStatus.OffDuty -> DutyStatus.OFF_DUTY
    },
)

private fun DriverVehicle.toDomain(): Vehicle = Vehicle(type = type, plate = plate)
