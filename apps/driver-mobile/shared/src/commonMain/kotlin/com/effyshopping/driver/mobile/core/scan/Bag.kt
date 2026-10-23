package com.effyshopping.driver.mobile.core.scan

import com.effyshopping.driver.mobile.contract.ParcelDTO

/**
 * One physical bag of a package, with its own label code. A package is one shop's share of an
 * order; it travels as one or more bags, and every step accounts for every bag. Bag 1's code is the
 * package's own 089 code, so a label printed before 096 is simply bag 1.
 */
data class Bag(val code: String, val seq: Int, val of: Int, val zone: BagZone)

enum class BagZone { AMBIENT, CHILLED, FROZEN }

/** "Bag 2 of 3", or "Bag 2 of 3 · Frozen" for a cold bag. */
fun Bag.title(): String = "Bag $seq of $of" + when (zone) {
    BagZone.FROZEN -> " · Frozen"
    BagZone.CHILLED -> " · Chilled"
    BagZone.AMBIENT -> ""
}

internal fun ParcelDTO.toDomain(): Bag = Bag(
    code = code,
    seq = seq.toInt(),
    of = of.toInt(),
    zone = when (zone.value) {
        "frozen" -> BagZone.FROZEN
        "chilled" -> BagZone.CHILLED
        else -> BagZone.AMBIENT
    },
)

/** The numbering the scan rule's words need ("Bag 2 of 3"). */
fun List<Bag>.numbers(): Map<String, BagNumber> = associate { it.code to BagNumber(it.seq, it.of) }
