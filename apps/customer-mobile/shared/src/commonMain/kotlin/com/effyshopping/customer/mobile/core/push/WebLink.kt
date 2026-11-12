package com.effyshopping.customer.mobile.core.push

/**
 * An Effy link the phone handed to the app (116 B7), back to the screen it opens. The Kotlin twin of `parseWebLink` in
 * `packages/shared-types/src/notification-destinations.ts`, pinned to `web-links.fixtures.json` (WebLinkFixtureTest; the
 * TypeScript test fails a copy that drifts).
 *
 * Only the paths the app claims (`APP_LINK_PATHS`) mean anything; any other is `null`, and the app opens Home. Unknown
 * query keys (campaign tags) are ignored; `m` is the message the link came from (never sent to analytics). Search
 * words decode as the website reads them: `+` is a space.
 */
data class OpenedLink(val destination: CustomerDestination?, val messageId: String?)

object WebLink {
    /** [pathAndQuery] as the link has it after the host: `/orders/abc?m=…`. */
    fun parse(pathAndQuery: String): OpenedLink {
        val noFragment = pathAndQuery.substringBefore('#')
        val rawPath = noFragment.substringBefore('?')
        val query = parseQuery(noFragment.substringAfter('?', ""))
        val path = if (rawPath.length > 1) rawPath.trimEnd('/').ifEmpty { "/" } else rawPath.ifEmpty { "/" }
        fun tail(prefix: String): String? {
            val rest = path.removePrefix(prefix)
            if (rest.isEmpty() || rest.contains('/')) return null
            return percentDecode(rest, plusIsSpace = false)?.takeIf { it.isNotEmpty() }
        }
        val destination: CustomerDestination? = when {
            path == "/" -> CustomerDestination.Home
            path == "/orders" -> CustomerDestination.Orders
            path.startsWith("/orders/") -> tail("/orders/")?.let { CustomerDestination.Order(it) }
            path == "/account/points" -> CustomerDestination.Points
            path.startsWith("/product/") -> tail("/product/")?.let { CustomerDestination.Product(it) }
            path == "/search" -> {
                val category = query["category"]?.takeIf { it.isNotEmpty() }
                val words = query["q"]?.takeIf { it.isNotEmpty() }
                when {
                    category != null -> CustomerDestination.Aisle(category)
                    words != null -> CustomerDestination.Search(words)
                    else -> CustomerDestination.Search()
                }
            }
            path == "/offers" -> CustomerDestination.Sale
            else -> null
        }
        return OpenedLink(destination, query["m"]?.takeIf { it.isNotEmpty() })
    }

    /** The first value of each key, as `URLSearchParams.get` gives it. */
    private fun parseQuery(q: String): Map<String, String> {
        if (q.isEmpty()) return emptyMap()
        val out = LinkedHashMap<String, String>()
        for (pair in q.split('&')) {
            if (pair.isEmpty()) continue
            val key = percentDecode(pair.substringBefore('='), plusIsSpace = true) ?: continue
            val value = percentDecode(pair.substringAfter('=', ""), plusIsSpace = true) ?: continue
            if (key !in out) out[key] = value
        }
        return out
    }

    /** UTF-8 percent-decoding; null for a malformed escape (the TypeScript side refuses it too). */
    private fun percentDecode(s: String, plusIsSpace: Boolean): String? {
        val bytes = ArrayList<Byte>(s.length)
        var i = 0
        while (i < s.length) {
            val c = s[i]
            when {
                c == '%' -> {
                    if (i + 2 >= s.length) return null
                    val v = s.substring(i + 1, i + 3).toIntOrNull(16) ?: return null
                    bytes.add(v.toByte())
                    i += 3
                    continue
                }
                c == '+' && plusIsSpace -> bytes.add(' '.code.toByte())
                else -> c.toString().encodeToByteArray().forEach { bytes.add(it) }
            }
            i += 1
        }
        return bytes.toByteArray().decodeToString()
    }
}

/** What the shell does with an opened link (116 FR-004): open it now, or hold it through sign-in first. */
sealed interface LinkPlan {
    data class Open(val destination: CustomerDestination?) : LinkPlan
    data class SignInFirst(val link: OpenedLink) : LinkPlan
}

/** Orders and points are the shopper's own; everything else (home, a product, an aisle, a search, offers) is public. */
fun CustomerDestination?.needsSignIn(): Boolean =
    this is CustomerDestination.Orders || this is CustomerDestination.Order || this is CustomerDestination.Points

/**
 * A public page opens at once; the shopper's own pages wait for sign-in and then open. Nothing is checked with the
 * server: the screen loads through the shopper's own session, so another person's order is simply not found there
 * (FR-005), and the app never switches accounts. A link the app does not know opens Home.
 */
fun linkPlan(link: OpenedLink, signedIn: Boolean): LinkPlan =
    if (link.destination.needsSignIn() && !signedIn) LinkPlan.SignInFirst(link) else LinkPlan.Open(link.destination)

/** The page kind for analytics (FR-006: the kind only). */
fun linkKind(destination: CustomerDestination?): String = when (destination) {
    null -> "unknown"
    CustomerDestination.Home -> "home"
    CustomerDestination.Orders -> "orders"
    is CustomerDestination.Order -> "order"
    CustomerDestination.Points -> "points"
    is CustomerDestination.Product -> "product"
    is CustomerDestination.Aisle -> "aisle"
    is CustomerDestination.Search -> "search"
    CustomerDestination.Sale -> "sale"
}
