package com.effyshopping.customer.mobile.features.checkout.presentation

import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFeeLineKind

/**
 * The delivery-fee words, exactly as `packages/shared-types/src/delivery-fee.ts` writes them;
 * `DeliveryFeeWordsTest` reads that file and fails on any difference. Change the TypeScript first.
 */
object DeliveryFeeWords {
    fun label(kind: DeliveryFeeLineKind): String = when (kind) {
        DeliveryFeeLineKind.Delivery -> "Delivery"
        DeliveryFeeLineKind.WindowSurcharge -> "Window surcharge"
        DeliveryFeeLineKind.SmallOrder -> "Small-order fee"
        DeliveryFeeLineKind.FreeDelivery -> "Free delivery"
    }

    const val SPEND_MORE = "Spend {amount} more for free delivery"
    const val FREE_REACHED = "You've got free delivery"
    const val SMALL_ORDER = "Orders under {amount} have a small-order fee"
    const val FEE_CHANGED = "The delivery fee has changed. Please check the new total."

    fun spendMore(amount: String): String = SPEND_MORE.replace("{amount}", amount)
}
