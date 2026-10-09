package com.effyshopping.customer.mobile.features.checkout

import com.effyshopping.customer.mobile.commerce.contract.DeliveryQuoteDTO
import com.effyshopping.customer.mobile.features.checkout.data.toDomain
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFee
import com.effyshopping.customer.mobile.features.checkout.domain.ChosenWindow
import com.effyshopping.customer.mobile.features.checkout.presentation.DeliveryFeeWords
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * 077 P25 — the app shows the SAME delivery lines as the website for the same quote. The fixture is
 * [DeliveryWireContractTest.DELIVERY_QUOTE_WIRE]; customer-web's `DeliveryFeeLines.parity.test.tsx`
 * renders it and asserts these exact strings.
 */
class DeliveryFeeParityTest {
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    /** How the checkout summary writes a line: the shared label, then the amount. */
    private fun shown(fee: DeliveryFee): List<String> = fee.lines.map { line ->
        val amount = if (line.amount.startsWith("-")) "−$${line.amount.removePrefix("-")}" else "$${line.amount}"
        "${DeliveryFeeWords.label(line.kind)}: $amount"
    }

    private val quote = json.decodeFromString<DeliveryQuoteDTO>(DeliveryWireContractTest.DELIVERY_QUOTE_WIRE).toDomain()

    @Test
    fun `the window today, with what it adds`() {
        val window = quote.effyWindows!!.days.first().windows.first()
        assertEquals(
            listOf("Delivery: $6.00", "Window surcharge: $5.00"),
            shown(quote.feeFor(ChosenWindow(window.slotId, window.date))!!),
        )
    }
}
