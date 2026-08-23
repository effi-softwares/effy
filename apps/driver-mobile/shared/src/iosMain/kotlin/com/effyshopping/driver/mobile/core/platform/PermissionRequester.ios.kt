package com.effyshopping.driver.mobile.core.platform

import androidx.compose.runtime.Composable

/**
 * iOS core-permission request (049 FR-004). The rationale (the priming screen) still shows on iOS — its
 * value is preparing the driver — but the actual OS prompts are requested **contextually** by each
 * framework at first use (camera at capture, location via CoreLocation, notifications via
 * UNUserNotificationCenter), which is the iOS-idiomatic pattern and avoids requesting access to features
 * not yet wired (push is a later platform slice; the location snapshot is optional). So this simply
 * completes. A pre-emptive UNUserNotificationCenter/CLLocationManager request is a recorded follow-up.
 */
@Composable
actual fun rememberCorePermissionRequester(onDone: () -> Unit): () -> Unit = { onDone() }
