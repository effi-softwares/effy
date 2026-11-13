package com.effyshopping.mobile.kit.update

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** 121: the phone's reading and decision give the fixtures' answers - the same as the TypeScript twin. */
class AppUpdateDecisionTest {
    private val fixtures = Json.parseToJsonElement(APP_UPDATE_FIXTURE).jsonObject

    @Test
    fun `every decide case gives its outcome`() {
        val cases = fixtures["decide"]!!.jsonArray
        assertTrue(cases.size >= 10)
        for (c in cases.map { it.jsonObject }) {
            val name = c["name"]!!.jsonPrimitive.content
            val settingsJson = c["settings"]!!
            val settings = if (settingsJson is JsonNull) null else parseAppUpdateSettings(settingsJson.toString())
            if (settingsJson !is JsonNull) assertTrue(settings != null, "$name: fixture settings must be readable")
            val outcome = decideAppUpdate(
                settings = settings,
                platform = if (c["platform"]!!.jsonPrimitive.content == "ios") AppPlatform.Ios else AppPlatform.Android,
                build = c["build"]!!.jsonPrimitive.int,
                noticeShownFor = c["noticeShownFor"]!!.jsonPrimitive.intOrNull,
                storeAllows = c["storeAllows"]!!.jsonPrimitive.boolean,
            )
            assertEquals(expected(c["expect"]!!.jsonObject), outcome, name)
        }
    }

    @Test
    fun `the phone reads exactly the files it can act on`() {
        val cases = fixtures["phone"]!!.jsonArray
        assertTrue(cases.isNotEmpty())
        for (c in cases.map { it.jsonObject }) {
            val name = c["name"]!!.jsonPrimitive.content
            val valid = c["valid"]!!.jsonPrimitive.boolean
            assertEquals(valid, parseAppUpdateSettings(c["body"]!!.jsonPrimitive.content) != null, name)
        }
    }

    @Test
    fun `everything the publisher accepts the phone can read`() {
        for (c in fixtures["publish"]!!.jsonArray.map { it.jsonObject }) {
            if (!c["ok"]!!.jsonPrimitive.boolean) continue
            val name = c["name"]!!.jsonPrimitive.content
            assertTrue(parseAppUpdateSettings(c["file"]!!.toString()) != null, name)
        }
    }

    private fun expected(e: JsonObject): AppUpdateOutcome = when (e["level"]!!.jsonPrimitive.content) {
        "mandatory" -> AppUpdateOutcome.Mandatory
        "optional" -> AppUpdateOutcome.Optional
        "notice" -> AppUpdateOutcome.Notice(e["latest"]!!.jsonPrimitive.int)
        else -> AppUpdateOutcome.None
    }
}
