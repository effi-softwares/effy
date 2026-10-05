package com.effyshopping.mobile.kit.live

import kotlinx.serialization.Serializable

/**
 * What `GET /{audience}/v1/live` answers (071): where the channel is and which one is this
 * person's. Mirrors `LiveDescriptor` in `packages/shared-types/src/live.ts`.
 *
 * `channelPrefix` is opaque — the client appends `/{epoch}` and nothing else, and never builds a
 * channel from an id it holds.
 */
@Serializable
data class LiveDescriptor(
    val httpHost: String,
    val realtimeHost: String,
    val channelPrefix: String,
    val epochSeconds: Long,
    /** The server's clock (ISO 8601), so a wrong device clock cannot pick the wrong epoch. */
    val serverTime: String,
)
