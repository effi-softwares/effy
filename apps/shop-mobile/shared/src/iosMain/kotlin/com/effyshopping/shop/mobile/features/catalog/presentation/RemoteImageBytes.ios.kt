package com.effyshopping.shop.mobile.features.catalog.presentation

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.darwin.Darwin
import io.ktor.client.request.get

private val iosCatalogImageHttpClient by lazy { HttpClient(Darwin) }

internal actual suspend fun loadRemoteImageBytes(url: String): ByteArray? =
    runCatching { iosCatalogImageHttpClient.get(url).body<ByteArray>() }.getOrNull()
