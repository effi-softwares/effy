package com.effyshopping.driver.mobile.core.scan

import com.effyshopping.driver.mobile.contract.HandoverMethod
import com.effyshopping.driver.mobile.contract.ParcelHandover
import com.effyshopping.driver.mobile.contract.ParcelMissing
import com.effyshopping.driver.mobile.contract.ParcelMissingReason

/** The wire's word for a hand-over method. */
internal fun HandMethod.toWire(): HandoverMethod = when (this) {
    HandMethod.SCAN -> HandoverMethod.Scan
    HandMethod.TYPED -> HandoverMethod.Typed
    HandMethod.MANUAL -> HandoverMethod.Manual
}

/** 096 — bags named by their label code, each with how it was handed over; null when there are none. */
internal fun List<HandedOver>.toWire(): List<ParcelHandover>? =
    takeIf { it.isNotEmpty() }?.map { ParcelHandover(method = it.method.toWire(), parcelCode = it.code) }

/** 096 — one bag declared missing at a step: its code, the step's reason key, and a note for "Other". */
data class MissingBag(val code: String, val reason: String, val note: String? = null)

/** 096 — bags declared missing; null when there are none. */
internal fun List<MissingBag>.toWireMissing(): List<ParcelMissing>? =
    takeIf { it.isNotEmpty() }?.map { m ->
        ParcelMissing(
            note = m.note?.trim()?.takeIf { it.isNotEmpty() },
            parcelCode = m.code,
            reason = ParcelMissingReason.entries.firstOrNull { it.value == m.reason } ?: ParcelMissingReason.Other,
        )
    }
