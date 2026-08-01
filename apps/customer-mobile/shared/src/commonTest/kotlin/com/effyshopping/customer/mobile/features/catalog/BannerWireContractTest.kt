package com.effyshopping.customer.mobile.features.catalog

import com.effyshopping.customer.mobile.commerce.contract.BannerDTO
import com.effyshopping.customer.mobile.commerce.contract.StorefrontHomeDTO
import com.effyshopping.customer.mobile.features.catalog.data.toDomain
import com.effyshopping.customer.mobile.features.catalog.domain.BannerTarget
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * ── THE CROSS-LANGUAGE WIRE CONTRACT (028) ──────────────────────────────────────────────────────
 *
 * The Kotlin half of `wire_contract_test.go`. 027's post-mortem named this exact test as the
 * strongest thing it could hand forward, and did not build it:
 *
 *   > Kotlin serialised quantities as `Double`, so the wire carried `1.0`; Go's `encoding/json`
 *   > refuses `1.0` into an `int`. **Every unit test passed throughout**, because the fakes spoke
 *   > Kotlin at both ends and never crossed the wire.
 *
 * ⚠ [BANNER_WIRE_JSON] is duplicated **verbatim** from the Go test, by hand, on purpose. Neither side
 * generates it and neither imports it. That is what makes it a contract: if Go starts emitting a
 * float, or the generated Kotlin starts expecting one, exactly ONE of these two files goes red — and
 * it does so on a laptop rather than on a device three weeks later.
 *
 * If you change this literal, change it in BOTH files or the test is worthless.
 */
private const val BANNER_WIRE_JSON =
    """{"key":"3f2a","title":"20% off your first order","subtitle":"Stock up",""" +
        """"imageUrl":null,"href":"/search","code":"FIRST20","terms":"On orders over ${'$'}30.00","position":2,""" +
        """"target":{"kind":"sale"}}"""

class BannerWireContractTest {

    // The app's real client config: unknown keys are tolerated so a field the backend adds later
    // cannot crash a shipped app (versioning-policy rule 4).
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `Kotlin can read the exact bytes Go emits`() {
        val dto = json.decodeFromString<BannerDTO>(BANNER_WIRE_JSON)

        assertEquals("3f2a", dto.key)
        assertEquals("20% off your first order", dto.title)
        assertEquals("FIRST20", dto.code)
        assertEquals("On orders over \$30.00", dto.terms)
        assertEquals(2L, dto.position, "position must decode as an integer, not a Double")
    }

    @Test
    fun `Kotlin emits an integer position that Go can read back`() {
        // ⚠ THE 027 DEFECT, IN REVERSE. The failure mode was Kotlin WRITING `1.0` where Go wanted an
        // int. `WireInt` / `@asType integer` makes the generated field a Long so it cannot; this
        // asserts the bytes rather than trusting the annotation.
        val encoded = json.encodeToString(BannerDTO.serializer(), json.decodeFromString(BANNER_WIRE_JSON))

        assertTrue(
            encoded.contains("\"position\":2"),
            "position must serialise as an integer literal; got: $encoded",
        )
        assertTrue(
            !encoded.contains("\"position\":2.0"),
            "position serialised as a float — Go's encoding/json will refuse it, exactly as in 027",
        )
    }

    @Test
    fun `the wire payload maps to a usable domain banner`() {
        // The contract is only worth having if what comes out the far end is renderable.
        val banner = json.decodeFromString<BannerDTO>(BANNER_WIRE_JSON).toDomain()

        assertEquals(2, banner.position)
        assertEquals("FIRST20", banner.code)
        assertEquals(BannerTarget.Sale, banner.target)
    }

    @Test
    fun `an empty banner list decodes as an empty list rather than failing`() {
        // FR-035: the ordinary state of a store with no live promotion. Go emits `[]`, never `null`
        // (its own test pins that); this is the half that proves the client survives it.
        val home = json.decodeFromString<StorefrontHomeDTO>("""{"banners":[],"rails":[]}""")

        assertEquals(0, home.banners.size)
        assertTrue(home.toDomain().banners.isEmpty())
    }

    @Test
    fun `a banner with no advertising fields still decodes`() {
        // Every 028 field is OPTIONAL on the wire. A payload from a server that has not been
        // redeployed yet must not crash a shipped client — that asymmetry is normal during a rollout.
        val dto = json.decodeFromString<BannerDTO>(
            """{"key":"k","title":"t","subtitle":null,"imageUrl":null,"href":null}""",
        )

        assertEquals(null, dto.position)
        assertEquals(null, dto.target)
        assertEquals(0, dto.toDomain().position, "an absent position must default, not throw")
    }
}
