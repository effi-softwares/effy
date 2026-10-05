package com.effyshopping.customer.mobile.core.http

import com.effyshopping.customer.mobile.core.auth.Session
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

/**
 * Which token is the bearer (027 research R12; one backend since 070).
 *
 * ⚠ This test exists because the answer was once WRONG for two slices and nothing could catch it.
 * There were two backends that wanted different bearers, and the app sent the ID token to both:
 * every authenticated commerce call answered 401 from 019 until 027, silently, because every call
 * site swallowed the failure and the choice lived inside a Ktor plugin nothing could test.
 *
 * 070 left one backend behind one gateway, so there is one answer — and it stays pinned, because
 * "which token" is exactly the kind of choice that is wrong without anything failing.
 */
class AuthHeadersTest {

    private val session = Session(sub = "sub-1", idToken = "ID.TOKEN.VALUE", accessToken = "ACCESS.TOKEN.VALUE")

    @Test
    fun the_gateway_gets_the_ID_token_as_bearer_plus_the_relayed_access_token() {
        val headers = authHeadersFor(session)

        assertEquals("Bearer ID.TOKEN.VALUE", headers["Authorization"])
        assertEquals("ACCESS.TOKEN.VALUE", headers["X-Effy-Access-Token"])
    }

    // The gateway's authorizer checks the token's audience, and only an ID token carries one. An
    // access token as bearer is a flat 401 on every route.
    @Test
    fun the_access_token_is_never_the_bearer() {
        val bearer = authHeadersFor(session)["Authorization"]!!

        assertFalse(bearer.contains("ACCESS.TOKEN"), "the gateway authorizer pins `aud`, which an access token does not have")
    }

    @Test
    fun exactly_two_headers_and_nothing_else() {
        assertEquals(setOf("Authorization", "X-Effy-Access-Token"), authHeadersFor(session).keys)
    }
}
