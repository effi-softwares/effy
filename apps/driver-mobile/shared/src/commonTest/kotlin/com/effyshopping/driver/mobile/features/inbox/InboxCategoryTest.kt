package com.effyshopping.driver.mobile.features.inbox

import com.effyshopping.driver.mobile.features.inbox.domain.InboxCategories
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals

/** The Kotlin twin of `INBOX_CATEGORIES` is the fixtures file (110 R13). */
class InboxCategoryTest {
    @Test
    fun every_category_has_the_fixture_label_and_icon() {
        val rows = Json.parseToJsonElement(INBOX_CATEGORY_FIXTURE).jsonObject.getValue("categories").jsonArray.map { it.jsonObject }
        assertEquals(rows.map { it.getValue("key").jsonPrimitive.content }, InboxCategories.ALL.map { it.key })
        for (row in rows) {
            val info = InboxCategories.of(row.getValue("key").jsonPrimitive.content)!!
            assertEquals(row.getValue("label").jsonPrimitive.content, info.label)
            assertEquals(row.getValue("icon").jsonPrimitive.content, info.icon)
            // The driver inbox filters by none of them (FR-007).
            assertEquals(false, row.getValue("filterableBy").jsonArray.any { it.jsonPrimitive.content == "driver" })
        }
    }
}
