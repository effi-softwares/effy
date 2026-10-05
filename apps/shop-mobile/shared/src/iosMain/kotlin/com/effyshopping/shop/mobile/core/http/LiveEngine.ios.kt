package com.effyshopping.shop.mobile.core.http

import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.darwin.Darwin

actual fun liveEngine(): HttpClientEngine = Darwin.create()
