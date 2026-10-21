package com.effyshopping.customer.mobile.features.catalog

import com.effyshopping.customer.mobile.commerce.contract.SkinSettings as WireSettings
import com.effyshopping.customer.mobile.core.http.effyJson
import com.effyshopping.customer.mobile.features.catalog.data.decodePromotionGroups
import com.effyshopping.customer.mobile.features.catalog.data.toDomain
import com.effyshopping.customer.mobile.features.catalog.data.toLook
import com.effyshopping.customer.mobile.features.catalog.domain.PromoSkinRules
import com.effyshopping.customer.mobile.features.catalog.domain.SkinLayout
import com.effyshopping.customer.mobile.features.catalog.domain.SkinRadius
import com.effyshopping.customer.mobile.features.catalog.domain.SkinSize
import com.effyshopping.customer.mobile.features.catalog.domain.SkinSpacing
import com.effyshopping.customer.mobile.features.catalog.domain.SkinTextSize
import com.effyshopping.customer.mobile.features.catalog.domain.SkinWeight
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * 095 — the app draws a skin with the same numbers and words as the website (`PromoSkin.tsx`), because both
 * are held to `promotion-skins.fixtures.json`.
 */
class PromoSkinFixturesTest {
    private val fixture = Json.parseToJsonElement(PROMO_SKIN_FIXTURE).jsonObject

    private fun layoutOf(v: String) = SkinLayout.valueOf(v.uppercase())
    private fun sizeOf(v: String) = SkinSize.valueOf(v.uppercase())

    @Test
    fun constants() {
        val c = fixture.getValue("constants").jsonObject
        val text = c.getValue("textPx").jsonObject
        mapOf("xs" to SkinTextSize.XS, "sm" to SkinTextSize.SM, "md" to SkinTextSize.MD, "lg" to SkinTextSize.LG, "xl" to SkinTextSize.XL, "2xl" to SkinTextSize.XXL)
            .forEach { (k, v) -> assertEquals(text.getValue(k).jsonPrimitive.int, v.px, k) }
        SkinSpacing.entries.forEach { assertEquals(c.getValue("spacingPx").jsonObject.getValue(it.name.lowercase()).jsonPrimitive.int, it.px) }
        SkinRadius.entries.forEach { assertEquals(c.getValue("radiusPx").jsonObject.getValue(it.name.lowercase()).jsonPrimitive.int, it.px) }
        SkinWeight.entries.forEach { assertEquals(c.getValue("weight").jsonObject.getValue(it.name.lowercase()).jsonPrimitive.int, it.value) }
    }

    @Test
    fun geometry() {
        for (case in fixture.getValue("geometry").jsonArray) {
            val o = case.jsonObject
            val layout = layoutOf(o.getValue("layout").jsonPrimitive.content)
            val size = sizeOf(o.getValue("size").jsonPrimitive.content)
            val want = o.getValue("expect").jsonObject
            val got = assertNotNull(PromoSkinRules.geometry(layout, size), "$layout at $size")
            assertEquals(want.getValue("minHeight").jsonPrimitive.int, got.minHeight, "$layout at $size")
            assertTrue(abs(want.getValue("pictureRatio").jsonPrimitive.double - got.pictureRatio) < 1e-9, "$layout at $size ratio")
            assertEquals(want.getValue("wordsWidth").jsonPrimitive.double, got.wordsWidth, "$layout at $size words")
            assertEquals(want.getValue("decorations").jsonPrimitive.boolean, got.decorations, "$layout at $size decorations")
        }
    }

    @Test
    fun words() {
        for (case in fixture.getValue("words").jsonArray) {
            val o = case.jsonObject
            val settings = effyJson.decodeFromJsonElement(WireSettings.serializer(), o.getValue("settings")).toDomain()
            val hasCode = o.getValue("hasCode").jsonPrimitive.boolean
            val want = o.getValue("expect").jsonObject
            fun str(k: String) = want.getValue(k).let { if (it is JsonNull) null else it.jsonPrimitive.content }
            assertEquals(str("button"), PromoSkinRules.buttonWords(settings, hasCode))
            assertEquals(str("label"), PromoSkinRules.labelWords(settings, hasCode))
        }
    }

    @Test
    fun appearance() {
        for (case in fixture.getValue("appearance").jsonArray) {
            val o = case.jsonObject
            val settings = effyJson.decodeFromJsonElement(WireSettings.serializer(), o.getValue("settings")).toDomain()
            assertEquals(o.getValue("expect").jsonPrimitive.content, PromoSkinRules.coloursFor(settings, dark = true).background.colour)
        }
    }

    @Test
    fun `a skin this build does not understand costs it the skin, never the promotion`() {
        val body = """
            {"groups":[{"key":"home-hero","promotions":[
              {"id":"p1","kind":"cart","headline":"10% off","supportingLine":null,"label":null,"code":"WINTER10","terms":null,"endsIn":null,
               "target":{"kind":"promotion","promotionId":"p1"},
               "skin":{"id":"s1","version":1,"layout":"hologram","size":"large"}},
              {"id":"p2","kind":"cart","headline":"5% off","supportingLine":null,"label":null,"code":null,"terms":null,"endsIn":null,
               "target":{"kind":"promotion","promotionId":"p2"},
               "skin":{"id":"s0","version":1,"layout":"classic","size":"large"}}
            ]}]}
        """.trimIndent()
        val groups = decodePromotionGroups(effyJson, Json.parseToJsonElement(body))
        val promos = groups.getValue("home-hero")
        assertEquals(listOf("p1", "p2"), promos.map { it.id })
        assertNull(promos[0].skin)
        assertEquals(SkinLayout.CLASSIC, promos[1].skin?.toLook()?.layout)
        assertTrue(JsonObject(emptyMap()).isEmpty())
    }
}
