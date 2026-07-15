package com.effyshopping.customer.mobile.core.http

import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.darwin.Darwin

actual fun httpEngine(): HttpClientEngine = Darwin.create()
