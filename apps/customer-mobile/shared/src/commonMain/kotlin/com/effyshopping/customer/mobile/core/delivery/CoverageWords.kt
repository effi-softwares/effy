package com.effyshopping.customer.mobile.core.delivery

import com.effyshopping.customer.mobile.commerce.contract.CoverageKind

/**
 * Who delivers to an address (076): Effy's own drivers, a courier, or nobody.
 *
 * Worked out by the server when the address or the quote is read, never kept on the device — a
 * postcode that leaves Effy's list changes the answer the next time it is shown.
 */
enum class Coverage { Effy, Courier, None }

/** `null` in, `null` out: a server older than 076 says nothing, and the app then says nothing. */
fun CoverageKind?.toCoverage(): Coverage? = when (this) {
    CoverageKind.Effy -> Coverage.Effy
    CoverageKind.Courier -> Coverage.Courier
    CoverageKind.None -> Coverage.None
    null -> null
}

/**
 * ⚠ THE ONLY PLACE THESE WORDS ARE WRITTEN IN THE APP — AND THEY ARE A MIRROR.
 *
 * The source of truth is `packages/shared-types/src/delivery.ts` (`COVERAGE_LABEL`,
 * `COVERAGE_REFUSAL_SENTENCE`), which the server, the website and this app all show. The spec
 * requires the refusal to be the SAME sentence wherever a customer meets it (076 FR-022), and the
 * app cannot import a TypeScript file — so `packages/shared-types/src/coverage-words.test.ts` reads
 * THIS file and fails when a string here differs by a character. Change the words there first.
 *
 * Before 076 the app wrote its own refusal, twice, worded differently from the website's.
 */
object CoverageWords {
    const val DELIVERED_BY_EFFY = "Delivered by Effy"
    const val COURIER_DELIVERY = "Courier delivery"
    const val REFUSAL = "Sorry, we can't deliver to this address."

    /** What to show beside an address: who delivers, or the refusal. `null` when the server did not say. */
    fun describe(coverage: Coverage?): String? = when (coverage) {
        Coverage.Effy -> DELIVERED_BY_EFFY
        Coverage.Courier -> COURIER_DELIVERY
        Coverage.None -> REFUSAL
        null -> null
    }
}
