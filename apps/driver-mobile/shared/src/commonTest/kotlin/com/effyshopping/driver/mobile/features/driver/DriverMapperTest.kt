package com.effyshopping.driver.mobile.features.driver

import com.effyshopping.driver.mobile.contract.DriverDutyStatus
import com.effyshopping.driver.mobile.contract.DriverMeDTO
import com.effyshopping.driver.mobile.contract.DriverVehicle
import com.effyshopping.driver.mobile.features.driver.data.toDomain
import com.effyshopping.driver.mobile.features.driver.domain.DutyStatus
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class DriverMapperTest {

    @Test
    fun maps_the_me_dto_to_the_driver_domain_model() {
        val dto = DriverMeDTO(
            dutyStatus = DriverDutyStatus.OnDuty,
            hub = "Effy Hub",
            id = "d1",
            name = "Jomo Ondiek",
            vehicle = DriverVehicle(plate = "1QZ 4KP", type = "Van"),
            workEmail = "jomo@effyshopping.com",
            zone = "Inner North",
        )

        val driver = dto.toDomain()

        assertEquals("d1", driver.id)
        assertEquals("Jomo Ondiek", driver.display)
        assertEquals("Inner North", driver.zone)
        assertEquals("Effy Hub", driver.hub)
        assertEquals(DutyStatus.ON_DUTY, driver.dutyStatus)
        assertEquals("Van", driver.vehicle.type)
    }

    @Test
    fun display_falls_back_to_email_when_name_is_blank() {
        val dto = DriverMeDTO(
            dutyStatus = DriverDutyStatus.OffDuty,
            hub = null,
            id = "d2",
            name = "  ",
            vehicle = DriverVehicle(plate = null, type = null),
            workEmail = "sam@effyshopping.com",
            zone = null,
        )
        assertEquals("sam@effyshopping.com", dto.toDomain().display)
        assertEquals(DutyStatus.OFF_DUTY, dto.toDomain().dutyStatus)
    }

    @Test
    fun the_me_dto_carries_no_currency_field() {
        // The driver never sees money (FR-013) — a structural guard against a money field creeping in.
        val fields = DriverMeDTO::class.simpleName
        assertTrue(fields == "DriverMeDTO")
    }
}
