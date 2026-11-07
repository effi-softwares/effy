package com.effyshopping.customer.mobile.core.push

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** The customer half of `notification-destinations.fixtures.json` (109): the same answers as the TypeScript parser. */
class DestinationTest {

    private val cases = Json.parseToJsonElement(DESTINATION_FIXTURE).jsonObject["cases"]!!.jsonArray
        .map { it.jsonObject }
        .filter { it["audience"]!!.jsonPrimitive.content == "customer" }

    /** The fixture's expected object, as this app's type. */
    private fun expected(e: JsonObject): CustomerDestination? {
        fun f(k: String) = e[k]?.jsonPrimitive?.content
        return when (f("kind")) {
            "home" -> CustomerDestination.Home
            "orders" -> CustomerDestination.Orders
            "order" -> CustomerDestination.Order(f("orderId")!!)
            "points" -> CustomerDestination.Points
            "product" -> CustomerDestination.Product(f("productId")!!, f("aisleKey"))
            "aisle" -> CustomerDestination.Aisle(f("aisleKey")!!, f("title"))
            "search" -> CustomerDestination.Search(f("query"))
            "sale" -> CustomerDestination.Sale
            else -> error("fixture kind ${f("kind")} has no Kotlin case")
        }
    }

    @Test
    fun everyCustomerCaseParsesAsTheFixtureSays() {
        assertTrue(cases.size > 10)
        for (c in cases) {
            val name = c["name"]!!.jsonPrimitive.content
            val wire = c["wire"]!!.jsonPrimitive.content
            val expect = c["expect"].let { if (it == null || it is JsonNull) null else expected(it.jsonObject) }
            assertEquals(expect, parseCustomerDestination(wire), name)
        }
    }

    @Test
    fun theReadRoutesFieldsParseTheSameWay() {
        assertEquals(CustomerDestination.Order("o1"), parseCustomerDestination(mapOf("kind" to "order", "orderId" to "o1")))
        assertEquals(null, parseCustomerDestination(mapOf("kind" to "run", "runId" to "r1")))
        assertEquals(null, parseCustomerDestination(null as String?))
    }
}
