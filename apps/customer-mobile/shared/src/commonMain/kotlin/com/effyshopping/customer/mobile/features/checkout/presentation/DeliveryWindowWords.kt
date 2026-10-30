package com.effyshopping.customer.mobile.features.checkout.presentation

/**
 * The words of the delivery-window picker.
 *
 * A mirror, not a source. These are `DELIVERY_WINDOW_WORDS` in
 * `packages/shared-types/src/delivery.ts`, the one place they are written; the website renders those
 * constants and `effy-windows.test.ts` reads this file and fails if a single character differs. Change
 * the TypeScript, then this.
 *
 * "Standard delivery" kept its name and changed its meaning: Effy, on a later day, in a window.
 */
object DeliveryWindowWords {
    const val SECTION_SAME_DAY = "Same-day delivery"
    const val SECTION_STANDARD = "Standard delivery"
    const val TODAY_CLOSED = "No windows left today."
    const val TODAY_NOT_DELIVERY_DAY = "We don't deliver today."
    const val DAY_FULL = "Every window on this day is taken."
    const val NO_WINDOWS = "There are no delivery windows available in the next few days. Please try again later."
    const val CUTOFF_PREFIX = "Order by"

    // Standard delivery without a time. A day is a complete choice; a time is optional.
    const val ANY_TIME_DAY = "Any time during the day"
    const val TIME_OPTION_OPEN = "Need a specific time?"
    const val TIME_OPTION_HINT = "Optional. Pick a window and we'll deliver in it."
    const val TIME_REQUIRED = "Choose a time for this day."
    const val ASAP_TITLE = "Standard"
    const val ASAP_HINT = "We'll deliver as soon as we can."
    const val ASAP_ESTIMATE_PREFIX = "As soon as possible -"
}
