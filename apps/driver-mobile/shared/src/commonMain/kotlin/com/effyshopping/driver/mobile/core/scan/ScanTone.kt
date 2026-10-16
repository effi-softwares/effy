package com.effyshopping.driver.mobile.core.scan

import androidx.compose.runtime.Composable

/**
 * 092 — the short sound a scan makes: a beep for a package that counts, a lower double tone for a hard
 * stop. ⚠ The phone's silent mode is respected on both platforms — a driver at a door at night is not
 * made to beep. Nothing sounds for "already scanned" or a product barcode.
 */
interface ScanTone {
    fun accepted()
    fun hardStop()
}

@Composable
expect fun rememberScanTone(): ScanTone
