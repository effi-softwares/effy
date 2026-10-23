package com.effyshopping.customer.mobile.core.http

import com.effyshopping.customer.mobile.core.auth.Session
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

/** Which token is the bearer: pinned, because the wrong one fails every authenticated call without anything else failing. */
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
