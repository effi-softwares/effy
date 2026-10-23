package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImagePainter
import coil3.compose.SubcomposeAsyncImage
import coil3.compose.SubcomposeAsyncImageContent

/**
 * A product image in three states: loading → a shimmering plate; error or no image → the letter mark;
 * loaded → the photograph. The plate is exactly the image's size, so nothing reflows as pictures land.
 */
@Composable
fun ProductImage(url: String?, name: String, modifier: Modifier = Modifier) {
    if (url.isNullOrBlank()) {
        LetterMark(name, modifier)
        return
    }

    SubcomposeAsyncImage(
        model = url,
        contentDescription = name,
        modifier = modifier,
        contentScale = ContentScale.Crop,
    ) {
        // `collectAsState`, not `painter.state.value`. In Coil 3 `state` is a StateFlow, and
        // reading `.value` directly subscribes to nothing — the shimmer would render once and stay,
        // for a photograph that had already arrived. The bug would look exactly like a slow network.
        val state by painter.state.collectAsState()

        when (state) {
            is AsyncImagePainter.State.Loading -> EffyShimmer(Modifier.fillMaxSize())
            // Error falls back to the letter mark, not to the shimmer. A shimmer that never resolves
            // promises something that is not coming, and leaves the shopper waiting for a picture that
            // has already failed. A stable mark is honest — and to the shopper it is the same thing as
            // a product that simply has no photograph.
            is AsyncImagePainter.State.Error -> LetterMark(name, Modifier.fillMaxSize())
            else -> SubcomposeAsyncImageContent()
        }
    }
}

/**
 * A shimmering placeholder plate for an image that is still arriving.
 *
 * Delegates to `Modifier.effyShimmer` in StorefrontKit — one shimmer implementation for the whole
 * app, so an image placeholder and a skeleton block can never drift into shimmering differently. It
 * also means reduced-motion handling is decided once.
 */
@Composable
fun EffyShimmer(modifier: Modifier = Modifier) {
    Box(modifier = modifier.effyShimmer())
}

/**
 * The stable fallback: the product's first letter.
 *
 * Derived from the name rather than chosen at random, so one product shows the same mark on every
 * screen and between launches. A placeholder that changes is a placeholder a shopper notices.
 */
@Composable
private fun LetterMark(name: String, modifier: Modifier) {
    Box(
        modifier = modifier.background(EffySurface.tint),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            name.take(1).uppercase(),
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
