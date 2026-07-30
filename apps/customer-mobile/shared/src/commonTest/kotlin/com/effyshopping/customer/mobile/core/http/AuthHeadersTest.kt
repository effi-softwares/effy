package com.effyshopping.customer.mobile.core.http

import com.effyshopping.customer.mobile.core.auth.Session
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Which token is the bearer, per backend (027 research R12).
 *
 * ⚠ This test exists because the answer was WRONG for two slices and nothing could catch it. The mobile app
 * sent the ID token to both backends. The edge api wants exactly that; the hot path verifies an ACCESS
 * token (`token_use == "access"` + `client_id`), and an ID token fails both checks — so every authenticated
 * customer-mobile call to core-api answered 401 from 019 until 027, silently, because every call site
 * swallowed the failure.
 *
 * The logic used to live inside a Ktor plugin over an `expect`/`actual` engine, which is why it was
 * untestable. It is a pure function now.
 */
class AuthHeadersTest {

    private val session = Session(sub = "sub-1", idToken = "ID.TOKEN.VALUE", accessToken = "ACCESS.TOKEN.VALUE")

    @Test
    fun the_edge_api_gets_the_ID_token_as_bearer_plus_the_relayed_access_token() {
        val headers = authHeadersFor(BearerToken.Edge, session)

        assertEquals("Bearer ID.TOKEN.VALUE", headers["Authorization"])
        assertEquals("ACCESS.TOKEN.VALUE", headers["X-Effy-Access-Token"])
    }

    // The bug, pinned: the hot path must receive the ACCESS token, never the ID token.
    @Test
    fun the_core_api_gets_the_ACCESS_token_as_bearer() {
        val headers = authHeadersFor(BearerToken.Core, session)

        assertEquals("Bearer ACCESS.TOKEN.VALUE", headers["Authorization"])
        assertFalse(
            headers["Authorization"]!!.contains("ID.TOKEN"),
            "the ID token as bearer is an instant 401 on core-api — token_use is \"id\" and it has no client_id",
        )
    }

    // Nothing reads it there, and a token in a header nobody reads is a leak with no upside.
    @Test
    fun the_core_api_is_sent_no_second_token_header() {
        val headers = authHeadersFor(BearerToken.Core, session)

        assertFalse(headers.containsKey("X-Effy-Access-Token"))
        assertEquals(1, headers.size)
    }

    @Test
    fun the_two_backends_are_never_sent_the_same_bearer() {
        val edge = authHeadersFor(BearerToken.Edge, session)["Authorization"]
        val core = authHeadersFor(BearerToken.Core, session)["Authorization"]

        assertTrue(edge != core, "one plugin serving both with one token is the defect this pins")
    }
}
