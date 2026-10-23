package com.effyshopping.mobile.kit.live

import kotlinx.serialization.Serializable

/**
 * What `GET /{audience}/v1/live` answers, mirroring `LiveDescriptor` in shared-types. `channelPrefix` is
 * opaque: the client appends `/{epoch}` and nothing else.
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
