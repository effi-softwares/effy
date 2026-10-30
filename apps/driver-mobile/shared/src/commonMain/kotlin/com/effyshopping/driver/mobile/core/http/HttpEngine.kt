package com.effyshopping.driver.mobile.core.http

import io.ktor.client.engine.HttpClientEngine

/**
 * The platform HTTP engine - the one legitimate `expect fun`: the Android engine
 * (HttpURLConnection) on Android, Darwin (NSURLSession) on iOS. (Android deliberately does not use Ktor's
 * OkHttp engine - that would drag in okhttp 4.x and clash with Amplify's AWS SDK, which needs okhttp 5.x.)
 * Everything else about the client is common.
 */
expect fun httpEngine(): HttpClientEngine
