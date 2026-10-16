package com.effyshopping.driver.mobile.core.scan

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import platform.AudioToolbox.AudioServicesPlaySystemSound

/** System sounds, which the silent switch mutes. */
@Composable
actual fun rememberScanTone(): ScanTone = remember {
    object : ScanTone {
        override fun accepted() = AudioServicesPlaySystemSound(1057u)
        override fun hardStop() = AudioServicesPlaySystemSound(1073u)
    }
}
