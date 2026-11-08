package com.effyshopping.driver.mobile.core.push

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals

/** The Kotlin twin of the driver category policy is the fixtures file (111 R2). */
class NotificationCategoryPolicyTest {
    private val root = Json.parseToJsonElement(NOTIFICATION_CATEGORY_FIXTURE).jsonObject
    private val rows = root.getValue("policies").jsonArray.map { it.jsonObject }
        .filter { it.getValue("audience").jsonPrimitive.content == "driver" }

    @Test
    fun every_driver_category_matches_the_fixture_in_order() {
        assertEquals(rows.map { it.getValue("category").jsonPrimitive.content }, NotificationCategoryPolicy.DRIVER.map { it.category })
        for (row in rows) {
            val key = row.getValue("category").jsonPrimitive.content
            val p = NotificationCategoryPolicy.DRIVER.first { it.category == key }
            assertEquals(row.getValue("label").jsonPrimitive.content, p.label, key)
            assertEquals(row.getValue("description").jsonPrimitive.content, p.description, key)
            assertEquals(row.getValue("reason").jsonPrimitive.content, p.reason, key)
            assertEquals(true, row.getValue("required").jsonPrimitive.boolean, key)
            assertEquals(row.getValue("androidChannel").jsonPrimitive.content, p.androidChannel, key)
        }
    }

    @Test
    fun the_android_channels_match_the_fixture() {
        val channels = root.getValue("androidChannels").jsonObject.getValue("driver").jsonArray.map { it.jsonObject }
        assertEquals(
            channels.map { Triple(it.getValue("id").jsonPrimitive.content, it.getValue("name").jsonPrimitive.content, it.getValue("importance").jsonPrimitive.content == "high") },
            NotificationCategoryPolicy.ANDROID_CHANNELS.map { Triple(it.id, it.name, it.high) },
        )
    }
}
