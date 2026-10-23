package com.effyshopping.customer.mobile.core.delivery

import com.effyshopping.customer.mobile.commerce.contract.CoverageKind

/**
 * Who delivers to an address: Effy's own drivers, a courier, or nobody.
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
 * The only place these words are written in the app, mirroring `packages/shared-types/src/delivery.ts`
 * (`COVERAGE_LABEL`, `COVERAGE_REFUSAL_SENTENCE`): the refusal is one sentence everywhere.
 * `packages/shared-types/src/coverage-words.test.ts` reads this file and fails on any difference. Change
 * the words there first.
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
