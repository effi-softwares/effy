package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImage

/**
 * A product image (019). Loads the presigned S3 URL via Coil3 (its Ktor3 network fetcher auto-registers,
 * so `AsyncImage(model = url)` just works on Android + iOS). Falls back to a stable placeholder — the
 * product's first letter — when there is no image or it is still loading, so a missing image never
 * leaves a blank tile.
 */
@Composable
fun ProductImage(url: String?, name: String, modifier: Modifier = Modifier) {
    if (url.isNullOrBlank()) {
        Placeholder(name, modifier)
    } else {
        AsyncImage(
            model = url,
            contentDescription = name,
            modifier = modifier,
            contentScale = ContentScale.Crop,
        )
    }
}

@Composable
private fun Placeholder(name: String, modifier: Modifier) {
    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        Text(
            name.take(1).uppercase(),
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
