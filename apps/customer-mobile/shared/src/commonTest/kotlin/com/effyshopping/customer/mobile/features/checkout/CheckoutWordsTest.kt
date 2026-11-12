package com.effyshopping.customer.mobile.features.checkout

import com.effyshopping.customer.mobile.features.checkout.presentation.CheckoutWords
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals

/** 114 - the app says the cart changed in the website's words. */
class CheckoutWordsTest {
    private val fixture = Json.parseToJsonElement(CHECKOUT_WORDS_FIXTURE).jsonObject

    @Test
    fun `the stock changed sentence is the shared one`() {
        assertEquals(fixture.getValue("stockChanged").jsonPrimitive.content, CheckoutWords.STOCK_CHANGED)
    }
}
