package com.effyshopping.customer.mobile.core.push

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject

/**
 * Where a notification leads (109): the customer's closed list. The Kotlin twin of
 * `packages/shared-types/src/notification-destinations.ts`, pinned to `notification-destinations.fixtures.json`
 * (DestinationTest; the TypeScript test fails a copy of the fixtures that drifts).
 *
 * Parsing is lenient on purpose: another audience's kind, a missing id or anything that is not JSON is `null`, and
 * the app then opens Home. A tap never crashes.
 */
sealed interface CustomerDestination {
    data object Home : CustomerDestination
    data object Orders : CustomerDestination
    data class Order(val orderId: String) : CustomerDestination
    data object Points : CustomerDestination
    data class Product(val productId: String, val aisleKey: String? = null) : CustomerDestination
    data class Aisle(val aisleKey: String, val title: String? = null) : CustomerDestination
    data class Search(val query: String? = null) : CustomerDestination
    data object Sale : CustomerDestination
}

private val lenient = Json { ignoreUnknownKeys = true }

/** The destination in [wire] (the push's `data.destination`, or the read route's object as JSON), or null. */
fun parseCustomerDestination(wire: String?): CustomerDestination? {
    val obj = parseObject(wire) ?: return null
    return customerDestinationOf(obj)
}

/** The same rules over fields already parsed (the read route's `destination` map). */
fun parseCustomerDestination(fields: Map<String, String>): CustomerDestination? =
    customerDestinationOf(JsonObject(fields.mapValues { JsonPrimitive(it.value) }))

private fun customerDestinationOf(obj: JsonObject): CustomerDestination? {
    fun text(key: String): String? =
        (obj[key] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it.isNotEmpty() }
    return when (text("kind")) {
        "home" -> CustomerDestination.Home
        "orders" -> CustomerDestination.Orders
        "order" -> text("orderId")?.let { CustomerDestination.Order(it) }
        "points" -> CustomerDestination.Points
        "product" -> text("productId")?.let { CustomerDestination.Product(it, text("aisleKey")) }
        "aisle" -> text("aisleKey")?.let { CustomerDestination.Aisle(it, text("title")) }
        "search" -> CustomerDestination.Search(text("query"))
        "sale" -> CustomerDestination.Sale
        else -> null
    }
}

internal fun parseObject(wire: String?): JsonObject? {
    if (wire.isNullOrBlank()) return null
    return runCatching { lenient.parseToJsonElement(wire).jsonObject }.getOrNull()
}
