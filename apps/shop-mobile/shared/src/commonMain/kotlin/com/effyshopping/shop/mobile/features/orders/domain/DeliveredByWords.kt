package com.effyshopping.shop.mobile.features.orders.domain

/**
 * Who takes a package away from the shop, in the two words every shop screen uses (079).
 *
 * ⚠ A MIRROR OF `DELIVERED_BY_WORDS` in `packages/shared-types/src/delivery-type.ts`, which the shop
 * web console imports. This app cannot import a TypeScript file, so `delivery-type.test.ts` there reads
 * THIS file and holds it, character for character, to the source. Change the words there, then here.
 *
 * ⚠ "Same-day" and "standard" are the CUSTOMER'S words and are never shown to a shop
 * (`scripts/check-shop-delivery-words.sh`).
 */
object DeliveredByWords {
    const val EFFY_DRIVER = "Effy driver"
    const val COURIER = "Courier"
}

fun DeliveredBy.words(): String = when (this) {
    DeliveredBy.EFFY_DRIVER -> DeliveredByWords.EFFY_DRIVER
    DeliveredBy.COURIER -> DeliveredByWords.COURIER
}

/** "Effy driver · ready by 4:30 pm" — or just "Ready by 4:30 pm" when the server did not say who. */
fun promiseLine(deliveredBy: DeliveredBy?, readyBy: String): String =
    if (deliveredBy == null) "Ready by $readyBy" else "${deliveredBy.words()} · ready by $readyBy"
