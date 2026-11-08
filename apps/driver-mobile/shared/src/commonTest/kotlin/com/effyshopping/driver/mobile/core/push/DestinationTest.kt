package com.effyshopping.driver.mobile.core.push

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** The driver half of `notification-destinations.fixtures.json` (109): the same answers as the TypeScript parser. */
class DestinationTest {

    private val cases = Json.parseToJsonElement(DESTINATION_FIXTURE).jsonObject["cases"]!!.jsonArray
        .map { it.jsonObject }
        .filter { it["audience"]!!.jsonPrimitive.content == "driver" }

    private fun expected(e: JsonObject): DriverDestination? = when (e["kind"]?.jsonPrimitive?.content) {
        "today" -> DriverDestination.Today
        "run" -> DriverDestination.Run(e["runId"]!!.jsonPrimitive.content)
        "account" -> DriverDestination.Account
        else -> error("fixture kind has no Kotlin case")
    }

    @Test
    fun everyDriverCaseParsesAsTheFixtureSays() {
        assertTrue(cases.size >= 5)
        for (c in cases) {
            val wire = c["wire"]!!.jsonPrimitive.content
            val expect = c["expect"].let { if (it == null || it is JsonNull) null else expected(it.jsonObject) }
            assertEquals(expect, parseDriverDestination(wire), c["name"]!!.jsonPrimitive.content)
        }
    }

    @Test
    fun theReadRoutesFieldsParseTheSameWay() {
        assertEquals(DriverDestination.Run("r1"), parseDriverDestination(mapOf("kind" to "run", "runId" to "r1")))
        assertEquals(null, parseDriverDestination(mapOf("kind" to "order", "orderId" to "o1")))
    }
}
