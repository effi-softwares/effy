package com.effyshopping.shop.mobile.features.catalog.presentation

internal expect suspend fun loadRemoteImageBytes(url: String): ByteArray?
