package com.effyshopping.mobile.kit.live

/**
 * The socket, as much of it as the live client needs — so the client's rules can be tested against
 * a fake, and so the engine (CIO on Android, Darwin on iOS) is each app's concern, not this file's.
 */
interface LiveTransport {
    /**
     * Open `wss://{host}/event/realtime` offering `protocols` as WebSocket subprotocols, and run
     * `session` on it. Returns when the session returns or the socket closes; throws if it cannot
     * be opened or is lost.
     */
    suspend fun connect(host: String, protocols: List<String>, session: suspend LiveConnection.() -> Unit)
}

interface LiveConnection {
    suspend fun send(text: String)

    /** The next text frame. Throws when the socket has closed. */
    suspend fun receive(): String
}
