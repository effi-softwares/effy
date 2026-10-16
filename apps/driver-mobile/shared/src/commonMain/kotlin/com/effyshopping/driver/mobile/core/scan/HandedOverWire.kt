package com.effyshopping.driver.mobile.core.scan

import com.effyshopping.driver.mobile.contract.HandoverMethod
import com.effyshopping.driver.mobile.contract.PackageHandover

/** The wire's word for a hand-over method. */
internal fun HandMethod.toWire(): HandoverMethod = when (this) {
    HandMethod.SCAN -> HandoverMethod.Scan
    HandMethod.TYPED -> HandoverMethod.Typed
    HandMethod.MANUAL -> HandoverMethod.Manual
}

/** Packages named by their label code (092); null when there are none, so older payloads are unchanged. */
internal fun List<HandedOver>.toWire(): List<PackageHandover>? =
    takeIf { it.isNotEmpty() }?.map { PackageHandover(method = it.method.toWire(), packageCode = it.code) }
