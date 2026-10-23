package com.effyshopping.driver.mobile.core.scan

import com.effyshopping.driver.mobile.contract.LabelReadDTO
import com.effyshopping.driver.mobile.contract.ReadMethod
import com.effyshopping.driver.mobile.contract.ReadOutcome
import kotlin.concurrent.atomics.AtomicReference
import kotlin.concurrent.atomics.ExperimentalAtomicApi
import kotlin.time.Clock
import kotlin.uuid.Uuid

/**
 * Every read the driver makes, accepted or refused, kept until the next step's request carries it (`reads`).
 * Each has its own id (an offline replay records it once) and the phone's time. [drain] runs when a step's
 * request is built, so a queued request carries its reads.
 */
@OptIn(ExperimentalAtomicApi::class)
object ReadLog {
    private val pending = AtomicReference<List<LabelReadDTO>>(emptyList())

    /** This install's id, set once at start-up; reads name the device they were made on. */
    var deviceId: String? = null
    var appVersion: String? = null

    fun record(raw: String, typed: Boolean, outcome: ScanOutcome) {
        val read = LabelReadDTO(
            appVersion = appVersion?.take(32),
            clientReadID = Uuid.random().toString(),
            deviceAt = Clock.System.now().toString(),
            deviceID = deviceId,
            method = if (typed) ReadMethod.Typed else ReadMethod.Scan,
            outcome = ReadOutcome.entries.first { it.value == ScanRule.wireOutcome(outcome) },
            parcelCode = ScanRule.codeOf(outcome),
            raw = raw.trim().take(64),
        )
        while (true) {
            val now = pending.load()
            // Bounded: a phone left scanning all day never builds an unbounded request.
            if (pending.compareAndSet(now, (now + read).takeLast(200))) return
        }
    }

    /** Everything recorded since the last drain, and forget it. Null when there is nothing. */
    fun drain(): List<LabelReadDTO>? = pending.exchange(emptyList()).takeIf { it.isNotEmpty() }
}
