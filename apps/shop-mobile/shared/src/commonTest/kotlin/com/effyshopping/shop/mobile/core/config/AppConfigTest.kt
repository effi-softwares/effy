package com.effyshopping.shop.mobile.core.config

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The in-code Amplify config builder (013 D12 / FR-032). It must emit valid JSON with the shape both
 * Amplify SDKs accept — there is no `amplifyconfiguration.json`, so a malformed string here is a
 * silent auth outage. Values come from BuildKonfig (the test build uses the placeholder secrets).
 */
class AppConfigTest {

    @Test
    fun emits_valid_amplify_outputs_json() {
        val obj = Json.parseToJsonElement(buildAmplifyOutputsJson()).jsonObject
        assertEquals("1", obj["version"]!!.jsonPrimitive.content)

        val auth = obj["auth"]!!.jsonObject
        // Every key Amplify needs to resolve the pool is present and non-blank.
        for (key in listOf("aws_region", "user_pool_id", "user_pool_client_id")) {
            assertTrue(auth[key]!!.jsonPrimitive.content.isNotBlank(), "auth.$key must be present")
        }
    }
}
