package com.effyshopping.customer.mobile.features.notifications

import com.effyshopping.customer.mobile.features.notifications.domain.InboxCategories
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals

/** The Kotlin twin of `INBOX_CATEGORIES` is the fixtures file (110 R13); chips only for what the shopper has. */
class InboxCategoryTest {
    private val rows = Json.parseToJsonElement(INBOX_CATEGORY_FIXTURE).jsonObject.getValue("categories").jsonArray.map { it.jsonObject }

    @Test
    fun every_category_has_the_fixture_label_and_icon_and_the_customer_filter_rule() {
        assertEquals(rows.map { it.getValue("key").jsonPrimitive.content }, InboxCategories.ALL.map { it.key })
        for (row in rows) {
            val key = row.getValue("key").jsonPrimitive.content
            val info = InboxCategories.of(key)!!
            assertEquals(row.getValue("label").jsonPrimitive.content, info.label, key)
            assertEquals(row.getValue("icon").jsonPrimitive.content, info.icon, key)
            val filterable = row.getValue("filterableBy").jsonArray.any { it.jsonPrimitive.content == "customer" }
            assertEquals(filterable, info.filterable, key)
        }
    }

    @Test
    fun chips_follow_the_list_order_and_skip_what_a_customer_cannot_filter() {
        assertEquals(listOf("orders", "points"), InboxCategories.chipsFor(listOf("points", "work", "orders")).map { it.key })
    }
}
