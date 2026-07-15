package com.effyshopping.customer.mobile.core.http

import io.ktor.client.engine.HttpClientEngine

/**
 * The platform HTTP engine — the ONE legitimate `expect fun` (013 D5/research §3.4): the Android engine
 * (HttpURLConnection) on Android, Darwin (NSURLSession) on iOS. (Android deliberately does NOT use Ktor's
 * OkHttp engine — that would drag in okhttp 4.x and clash with Amplify's AWS SDK, which needs okhttp 5.x.)
 * Everything else about the client is common.
 */
expect fun httpEngine(): HttpClientEngine
