package com.effyshopping.customer.mobile.core.image

import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.darwin.Darwin

// Darwin (NSURLSession) — the same engine the data client uses on iOS. iOS never hit the Android
// platform-okhttp cancellation crash; this keeps image loads on the native, well-behaved engine.
internal actual fun imageHttpEngine(): HttpClientEngine = Darwin.create()
