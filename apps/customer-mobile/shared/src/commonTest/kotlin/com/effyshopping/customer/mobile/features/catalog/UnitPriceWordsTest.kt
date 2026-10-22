package com.effyshopping.customer.mobile.features.catalog

import com.effyshopping.customer.mobile.features.catalog.domain.UnitBasis
import com.effyshopping.customer.mobile.features.catalog.domain.UnitPrice
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * 098 — the app says a comparison price in the storefront's exact words (`unit-price.fixtures.json`).
 * The amount is the platform's; what is tested here is the sentence built from it.
 */
class UnitPriceWordsTest {
    private val cases = Json.parseToJsonElement(UNIT_PRICE_FIXTURE).jsonObject.getValue("cases").jsonArray

    @Test
    fun saysEveryFixtureAmountInTheStorefrontsWords() {
        var checked = 0
        for (c in cases) {
            val o = c.jsonObject
            val amount = o.getValue("amount").jsonPrimitive.contentOrNull ?: continue
            val basis = assertNotNull(UnitBasis.fromWire(o.getValue("basis").jsonPrimitive.content))
            assertEquals(o.getValue("text").jsonPrimitive.content, UnitPrice(amount, basis).text, o.toString())
            checked++
        }
        assertEquals(17, checked)
    }

    @Test
    fun anUnknownBasisIsLeftOutRatherThanGuessed() {
        assertEquals(null, UnitBasis.fromWire("per_dozen"))
    }
}
