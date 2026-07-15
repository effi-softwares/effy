package com.effyshopping.customer.mobile.core.http

import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.android.Android

// Ktor's Android engine (HttpURLConnection), NOT okhttp — so Ktor doesn't drag in okhttp 4.x and
// clash with Amplify's AWS SDK, which needs okhttp 5.x (`okhttp3.ConnectionListener`). 013 runtime fix.
actual fun httpEngine(): HttpClientEngine = Android.create()
