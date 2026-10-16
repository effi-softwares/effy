package com.effyshopping.driver.mobile.features.delivery.presentation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import com.effyshopping.driver.mobile.core.presentation.DriverStatus
import com.effyshopping.driver.mobile.core.presentation.nowEpochMillis
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryWindow
import com.effyshopping.driver.mobile.features.delivery.domain.DropStatus
import com.effyshopping.driver.mobile.features.delivery.domain.WindowState
import com.effyshopping.driver.mobile.features.delivery.domain.windowNote
import kotlinx.coroutines.delay

/**
 * The time now, re-read every half minute while a screen is up, so "Due now" becomes "Late" without a
 * touch. ⚠ A CLOCK, NOT A REFRESH: it re-words what is loaded and reads nothing (071).
 */
@Composable
internal fun rememberNow(): Long {
    val now by produceState(initialValue = nowEpochMillis()) {
        while (true) {
            delay(30_000)
            value = nowEpochMillis()
        }
    }
    return now
}

/** "Due now" / "Late" for an open drop's window; null when there is nothing to say. */
internal fun windowStatus(window: DeliveryWindow?, status: DropStatus, now: Long): DriverStatus? =
    when (windowNote(window, status, now)?.second) {
        WindowState.Due -> DriverStatus.DueNow
        WindowState.Late -> DriverStatus.Late
        else -> null
    }

internal val DropStatus.isClosed: Boolean get() = this == DropStatus.DELIVERED || this == DropStatus.FAILED

/** The street line of an address ("12 Lygon St") and the rest ("Carlton VIC 3053"). */
internal fun splitAddress(full: String): Pair<String, String?> {
    val parts = full.split(", ").filter { it.isNotBlank() }
    if (parts.size <= 1) return full to null
    return parts.first() to parts.drop(1).joinToString(" ")
}

internal fun packages(n: Int) = if (n == 1) "1 package" else "$n packages"
