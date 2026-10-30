package com.effyshopping.customer.mobile.core.presentation

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals

/** 101 - the app says 18+ in the website's words. */
class AgeWordsTest {
    private val fixture = Json.parseToJsonElement(AGE_WORDS_FIXTURE).jsonObject

    @Test
    fun `the label and the cart sentence are the shared ones`() {
        assertEquals(fixture.getValue("label").jsonPrimitive.content, AgeWords.LABEL)
        assertEquals(fixture.getValue("cartSentence").jsonPrimitive.content, AgeWords.CART_SENTENCE)
    }
}
