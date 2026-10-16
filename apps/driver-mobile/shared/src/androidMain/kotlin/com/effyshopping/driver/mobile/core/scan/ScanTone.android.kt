package com.effyshopping.driver.mobile.core.scan

import android.media.AudioManager
import android.media.ToneGenerator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember

/** On the notification stream, so a phone on silent or vibrate stays quiet. */
@Composable
actual fun rememberScanTone(): ScanTone {
    val generator = remember { runCatching { ToneGenerator(AudioManager.STREAM_NOTIFICATION, 80) }.getOrNull() }
    DisposableEffect(generator) { onDispose { generator?.release() } }
    return remember(generator) {
        object : ScanTone {
            override fun accepted() { generator?.startTone(ToneGenerator.TONE_PROP_BEEP, 120) }
            override fun hardStop() { generator?.startTone(ToneGenerator.TONE_PROP_NACK, 350) }
        }
    }
}
