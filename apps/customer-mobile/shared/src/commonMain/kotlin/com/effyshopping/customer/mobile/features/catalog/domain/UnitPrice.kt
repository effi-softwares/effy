package com.effyshopping.customer.mobile.features.catalog.domain

import kotlinx.serialization.Serializable

/**
 * The comparison price beside a price - "$0.64 / 100 g". Australian grocery shoppers compare
 * sizes by it.
 *
 * The platform computes it (whole cents, half up); the app only says it. The words are
 * `UNIT_BASIS_WORDS` in `packages/shared-types/src/unit-price.ts`, and this file is pinned to them by
 * `unit-price.fixtures.json` (`UnitPriceWordsTest`) - change both or neither.
 */
@Serializable
data class UnitPrice(val amount: String, val basis: UnitBasis) {
    /** "$0.64 / 100 g", "$0.60 each". */
    val text: String get() = "$$amount ${basis.words}"
}

@Serializable
enum class UnitBasis(val wire: String, val words: String) {
    Per10G("per_10g", UnitBasisWords.PER_10G),
    Per100G("per_100g", UnitBasisWords.PER_100G),
    PerKg("per_kg", UnitBasisWords.PER_KG),
    Per10Ml("per_10ml", UnitBasisWords.PER_10ML),
    Per100Ml("per_100ml", UnitBasisWords.PER_100ML),
    PerL("per_l", UnitBasisWords.PER_L),
    PerM("per_m", UnitBasisWords.PER_M),
    PerM2("per_m2", UnitBasisWords.PER_M2),
    Per100Sheets("per_100_sheets", UnitBasisWords.PER_100_SHEETS),
    Each("each", UnitBasisWords.EACH),
    ;

    companion object {
        /** Null for a basis this build does not know (a newer platform): the comparison is left out. */
        fun fromWire(wire: String): UnitBasis? = entries.firstOrNull { it.wire == wire }
    }
}

/** The words after the amount - the TypeScript `UNIT_BASIS_WORDS`, character for character. */
object UnitBasisWords {
    const val PER_10G = "/ 10 g"
    const val PER_100G = "/ 100 g"
    const val PER_KG = "/ kg"
    const val PER_10ML = "/ 10 mL"
    const val PER_100ML = "/ 100 mL"
    const val PER_L = "/ L"
    const val PER_M = "/ m"
    const val PER_M2 = "/ m²"
    const val PER_100_SHEETS = "/ 100 sheets"
    const val EACH = "each"
}
