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

/** 116 B7: `web-links.fixtures.json` - the same answers as the TypeScript `parseWebLink`. */
class WebLinkFixtureTest {

    private val links = Json.parseToJsonElement(WEB_LINK_FIXTURE).jsonObject["links"]!!.jsonArray.map { it.jsonObject }

    private fun expected(e: JsonObject?): CustomerDestination? {
        if (e == null) return null
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
    fun everyLinkOpensWhatTheFixtureSays() {
        assertTrue(links.size >= 20)
        for (l in links) {
            val path = l["path"]!!.jsonPrimitive.content
            val dest = l["destination"].let { if (it == null || it is JsonNull) null else it.jsonObject }
            val message = l["messageId"].let { if (it == null || it is JsonNull) null else it.jsonPrimitive.content }
            assertEquals(OpenedLink(expected(dest), message), WebLink.parse(path), path)
        }
    }

    @Test
    fun aMalformedEscapeOpensNothing() {
        assertEquals(null, WebLink.parse("/orders/%E0%A4%A").destination)
        assertEquals(CustomerDestination.Home, WebLink.parse("/").destination)
    }
}
