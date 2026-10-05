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
 * The live channel over Ktor WebSockets (071).
 *
 * ⚠ ITS OWN CLIENT, ON ITS OWN ENGINE. The apps' data client uses the `Android` engine
 * (HttpURLConnection), which has NO WebSocket support — and must not be switched to OkHttp, which
 * clashes with the OkHttp the auth SDK needs (013's runtime fix). So each app hands this an engine
 * that can hold a socket: CIO on Android (pure Kotlin, no OkHttp — the engine customer-mobile
 * already uses for images), Darwin on iOS.
 *
 * ⚠ THE TWO SUBPROTOCOLS GO IN ONE `Sec-WebSocket-Protocol` HEADER. The channel requires both
 * `aws-appsync-event-ws` and the `header-…` value that carries the handshake's authorization; a
 * connection offering only the first is refused.
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
                        // `receive()` throws when the socket has closed — which is the signal the
                        // client is waiting for.
                        val frame = socket.incoming.receive()
                        if (frame is Frame.Text) return frame.readText()
                    }
                }
            }.session()
        }
    }
}
