package com.effyshopping.customer.mobile.features.checkout.presentation

/**
 * Checkout sentences the website says too. Pinned to `packages/shared-types/src/checkout-words.fixtures.json` (the
 * website's `STOCK_CHANGED_MESSAGE`); `checkout-words.test.ts` there and `CheckoutWordsTest` here fail if they differ.
 */
object CheckoutWords {
    /** 114: payment did not start because the cart changed (another shopper took stock). Nothing was charged. */
    const val STOCK_CHANGED = "Some items in your cart changed while you were paying. Check your order, then pay again."
}
