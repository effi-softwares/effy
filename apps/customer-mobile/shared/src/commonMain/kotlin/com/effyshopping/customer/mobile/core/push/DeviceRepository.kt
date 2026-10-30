package com.effyshopping.customer.mobile.core.push

/**
 * Registers/unregisters this device's push token with the cold-path `/customer/v1/devices` endpoint.
 * Data layer; raw HTTP behind the edge client. No PII - the token is opaque
 * and the owner is the JWT subject the gateway authenticates.
 */
interface DeviceRepository {
    suspend fun register(fcmToken: String, platform: String)
    suspend fun unregister(fcmToken: String)
}
