package com.effyshopping.shop.mobile.core.http

import io.ktor.client.engine.HttpClientEngine

/**
 * The engine that holds the live-update channel's WebSocket (071).
 *
 * ⚠ NOT [httpEngine]. On Android that is HttpURLConnection, which cannot hold a WebSocket at all;
 * and it must not become OkHttp, whose version clashes with the one the auth SDK needs (013).
 * Android → CIO (pure Kotlin, no OkHttp). iOS → Darwin, which can.
 */
expect fun liveEngine(): HttpClientEngine
