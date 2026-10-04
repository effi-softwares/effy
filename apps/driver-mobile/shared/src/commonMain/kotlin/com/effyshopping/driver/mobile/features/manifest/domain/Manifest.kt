package com.effyshopping.driver.mobile.features.manifest.domain

/**
 * The driver's item manifest (065) — what is in a package, and how each item must be carried.
 *
 * ⚠ ONE DOMAIN, TWO CONSUMERS. The shop pickup and the customer drop both show a package's items.
 * They share these types and the views beside them so the class label, the icon and the ordering
 * cannot drift between two screens a driver reads in the same shift.
 */

/**
 * ⚠ [NotRecorded] IS NOT A SYNONYM FOR [Normal]. It is a line sold before the class was recorded at
 * purchase, and nobody knows what it was. Showing it as Normal would tell a driver a frozen item can
 * ride in the ambient compartment — the harm this whole feature exists to prevent (065 FR-010).
 */
enum class TemperatureClass(val label: String) {
    Frozen("Frozen"),
    Chilled("Chilled"),
    Normal("Normal"),
    NotRecorded("Class not recorded"),
}

data class ManifestLine(
    val name: String,
    /** The quantity IN THE BAG — what the shop gathered, not what was ordered. */
    val qty: Int,
    val orderedQty: Int,
    /** False when the shop supplied none of this line. Shown as "Not included", never hidden. */
    val included: Boolean,
    val temperatureClass: TemperatureClass,
) {
    /** The shop supplied some, but fewer than the customer ordered. */
    val partSupplied: Boolean get() = included && qty < orderedQty
}

/** Units in the bag per class. Computed by the server, once; the app renders it and never recounts. */
data class ClassSummary(val frozen: Int, val chilled: Int, val normal: Int, val notRecorded: Int) {
    val total: Int get() = frozen + chilled + normal + notRecorded

    /** True when the package holds goods that need the cold compartment. */
    val hasCold: Boolean get() = frozen > 0 || chilled > 0

    /**
     * The classes actually present, cold first — a class with nothing in it is left out rather than
     * shown as zero (FR-015).
     */
    val present: List<Pair<TemperatureClass, Int>>
        get() = listOf(
            TemperatureClass.Frozen to frozen,
            TemperatureClass.Chilled to chilled,
            TemperatureClass.Normal to normal,
            TemperatureClass.NotRecorded to notRecorded,
        ).filter { it.second > 0 }

    /** What a screen reader says, and what the unopened row shows in words. */
    val spoken: String
        get() = if (total == 0) "no items" else present.joinToString(", ") { (c, n) -> "$n ${c.label.lowercase()}" }

    companion object {
        val Empty = ClassSummary(0, 0, 0, 0)
    }
}
