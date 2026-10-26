package com.effyshopping.customer.mobile.core.presentation

/**
 * How an age-restricted (18+) product is said (101) — the twin of `packages/shared-types/src/age-words.ts`,
 * pinned to `age-words.fixtures.json` by `AgeWordsTest`. Labelling only: an age check comes later.
 */
object AgeWords {
    const val LABEL = "18+"

    /** Under the cart and checkout lines when any line is age-restricted. */
    const val CART_SENTENCE = "Includes 18+ items. You must be 18 or over to buy them."
}
