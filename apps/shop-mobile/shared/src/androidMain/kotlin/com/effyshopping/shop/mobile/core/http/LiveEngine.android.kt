package com.effyshopping.shop.mobile.core.http

import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.cio.CIO

actual fun liveEngine(): HttpClientEngine = CIO.create()
