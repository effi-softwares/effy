package com.effyshopping.customer.mobile.core.image

import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.cio.CIO

// CIO — pure Kotlin/coroutines, NO okhttp. The `Android`/HttpURLConnection engine routes through the
// platform `com.android.okhttp`, whose `AsyncTimeout` throws "Unbalanced enter/exit" when Coil cancels
// an image load during LazyGrid node reuse → a fatal completion-handler crash. CIO cancels cleanly.
internal actual fun imageHttpEngine(): HttpClientEngine = CIO.create()
