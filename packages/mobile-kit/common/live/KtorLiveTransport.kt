package com.effyshopping.mobile.kit.live

import io.ktor.client.HttpClient
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.client.request.header
import io.ktor.http.HttpHeaders
import io.ktor.websocket.Frame
import io.ktor.websocket.readText

/**
 * The live channel over Ktor WebSockets, on its own client and engine: the data client's `Android`
 * engine has no WebSocket support and OkHttp clashes with the auth sdk's, so apps pass CIO (Android)
 * or Darwin (iOS). Both subprotocols, `aws-appsync-event-ws` and the `header-…` authorization, go in one
 * `Sec-WebSocket-Protocol` header.
 */
class KtorLiveTransport(engine: HttpClientEngine) : LiveTransport {
    private val client = HttpClient(engine) { install(WebSockets) }

    override suspend fun connect(host: String, protocols: List<String>, session: suspend LiveConnection.() -> Unit) {
        client.webSocket(
            urlString = "wss://$host/event/realtime",
            request = { header(HttpHeaders.SecWebSocketProtocol, protocols.joinToString(", ")) },
        ) {
            val socket = this
            object : LiveConnection {
                override suspend fun send(text: String) = socket.send(Frame.Text(text))

                override suspend fun receive(): String {
                    while (true) {
                        // `receive` throws when the socket closes: the signal the client waits for.
                        val frame = socket.incoming.receive()
                        if (frame is Frame.Text) return frame.readText()
                    }
                }
            }.session()
        }
    }
}
