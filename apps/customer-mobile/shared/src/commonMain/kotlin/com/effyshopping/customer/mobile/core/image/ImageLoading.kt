package com.effyshopping.customer.mobile.core.image

import coil3.ImageLoader
import coil3.PlatformContext
import coil3.network.ktor3.KtorNetworkFetcherFactory
import io.ktor.client.HttpClient
import io.ktor.client.engine.HttpClientEngine

/**
 * A cancellation-safe Ktor engine for Coil's image loads (Android → CIO, iOS → Darwin). See
 * [newImageLoader] for why the engine choice matters.
 */
internal expect fun imageHttpEngine(): HttpClientEngine

/** One Ktor client shared by every image load; its engine is [imageHttpEngine]. */
private val imageHttpClient: HttpClient by lazy { HttpClient(imageHttpEngine()) }

/**
 * The app's singleton Coil [ImageLoader] (019), built on a Ktor fetcher whose engine cancels cleanly.
 *
 * Why it exists: Coil cancels an in-flight image job when a `LazyGrid`/`LazyList` REUSES a node during
 * scroll (`LayoutNode.onDeactivate` → `AsyncImagePainter.restart` → the job is cancelled). On Android the
 * default Ktor `Android` engine (HttpURLConnection → the platform `com.android.okhttp`) throws
 * `IllegalStateException: Unbalanced enter/exit` from `AsyncTimeout` INSIDE that cancellation completion
 * handler — and coroutines escalates an exception thrown from a completion handler to a fatal
 * `CompletionHandlerException`, crashing the app the first time you scroll past a product image. CIO (pure
 * Kotlin/coroutines, no okhttp) cancels without the bug. iOS (Darwin) never had the issue and is unchanged.
 *
 * Registered as the singleton at the app root ([com.effyshopping.customer.mobile.app.App]) so every
 * `AsyncImage`/`ProductImage` uses it.
 */
fun newImageLoader(context: PlatformContext): ImageLoader =
    ImageLoader.Builder(context)
        .components { add(KtorNetworkFetcherFactory(httpClient = { imageHttpClient })) }
        .build()
