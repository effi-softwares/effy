package com.effyshopping.customer.mobile.features.checkout.presentation

import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFeeLineKind

/**
 * 077 — the delivery-fee words, EXACTLY as `packages/shared-types/src/delivery-fee.ts` writes them.
 *
 * ⚠ A MIRROR, NOT A SECOND SOURCE. The app cannot import the TypeScript, so the words live once
 * here for every mobile screen, and `DeliveryFeeWordsTest` reads that file and fails if any of them
 * differs (the 076 `CoverageWords.kt` pattern). Change the TypeScript first; then this.
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
