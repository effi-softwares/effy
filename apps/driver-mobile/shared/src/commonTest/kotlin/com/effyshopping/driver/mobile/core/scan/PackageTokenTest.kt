package com.effyshopping.driver.mobile.core.scan

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** The app reads a label exactly as the platform does: every row of the shared fixture. */
class PackageTokenTest {
    @Test fun agrees_with_every_row_of_the_shared_fixture() {
        val rows = Json.parseToJsonElement(PACKAGE_CODE_FIXTURE).jsonObject["reads"]!!.jsonArray
        assertTrue(rows.isNotEmpty())
        for (row in rows) {
            val o = row.jsonObject
            val read = o["read"]!!.jsonPrimitive.content
            val code = o["code"]!!.let { if (it is JsonNull) null else it.jsonPrimitive.content }
            assertEquals(code, PackageToken.parse(read), "read ${read}")
        }
    }
}
