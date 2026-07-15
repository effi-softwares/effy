package com.effyshopping.customer.mobile.core.http

import io.ktor.client.engine.HttpClientEngine

/**
 * The platform HTTP engine — the ONE legitimate `expect fun` (013 D5/research §3.4): OkHttp on Android,
 * Darwin (NSURLSession) on iOS. Everything else about the client is common.
 */
expect fun httpEngine(): HttpClientEngine
