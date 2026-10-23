package com.effyshopping.driver.mobile.core.push

/**
 * Registers/unregisters this device's push token with `/driver/v1/devices`. No PII: the token is opaque
 * and the owner is the JWT subject the gateway authenticates.
 */
interface DeviceRepository {
    suspend fun register(fcmToken: String, platform: String)
    suspend fun unregister(fcmToken: String)
}
