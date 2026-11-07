package com.effyshopping.driver.mobile.core.push

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject

/**
 * Where a notification leads (109): the driver's closed list. The Kotlin twin of
 * `packages/shared-types/src/notification-destinations.ts`, pinned to `notification-destinations.fixtures.json`
 * (DestinationTest; the TypeScript test fails a copy of the fixtures that drifts).
 *
 * Lenient on purpose: anything this build does not know is `null`, and the app then opens Today.
 */
sealed interface DriverDestination {
    data object Today : DriverDestination
    data class Run(val runId: String) : DriverDestination
    data object Account : DriverDestination
}

private val lenient = Json { ignoreUnknownKeys = true }

/** The destination in [wire] (the push's `data.destination`), or null. */
fun parseDriverDestination(wire: String?): DriverDestination? {
    if (wire.isNullOrBlank()) return null
    val obj = runCatching { lenient.parseToJsonElement(wire).jsonObject }.getOrNull() ?: return null
    return driverDestinationOf(obj)
}

/** The same rules over fields already parsed (the read route's `destination` map). */
fun parseDriverDestination(fields: Map<String, String>): DriverDestination? =
    driverDestinationOf(JsonObject(fields.mapValues { JsonPrimitive(it.value) }))

private fun driverDestinationOf(obj: JsonObject): DriverDestination? {
    fun text(key: String): String? =
        (obj[key] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it.isNotEmpty() }
    return when (text("kind")) {
        "today" -> DriverDestination.Today
        "run" -> text("runId")?.let { DriverDestination.Run(it) }
        "account" -> DriverDestination.Account
        else -> null
    }
}
