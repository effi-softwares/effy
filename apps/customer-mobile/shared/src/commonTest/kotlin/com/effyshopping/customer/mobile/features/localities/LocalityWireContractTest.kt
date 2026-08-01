package com.effyshopping.customer.mobile.features.localities

import com.effyshopping.customer.mobile.commerce.contract.LocalityDTO
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * ── THE CROSS-LANGUAGE WIRE CONTRACT for the locality lookup (030) ──────────────────────────────
 *
 * The Kotlin half of the `LOCALITY_WIRE_JSON` block in `wire_contract_test.go`. Same mechanism as
 * [com.effyshopping.customer.mobile.features.catalog.BannerWireContractTest], for the same reason:
 * unit tests on both sides pass happily while the fakes speak one language and never cross the wire.
 *
 * ⚠ [LOCALITY_WIRE_JSON] is duplicated **verbatim** from the Go test, by hand, on purpose. Neither
 * side generates it and neither imports it. If you change it, change it in BOTH files or the test is
 * worthless.
 *
 * ⚠ Those bytes were **captured from the real Go handler through the real router**, not transcribed
 * from the contract document. 029 discovered the banner literal here had been pinning `{"kind":"sale"}`
 * — a shape no banner ever emitted — so the test that should have caught a defect encoded it instead.
 *
 * Three strings looks too simple to be worth pinning. That is exactly why it is worth pinning: a
 * silently renamed `json` tag on the Go side compiles fine, deserialises to empty strings here, and
 * leaves a shopper unable to find any suburb at all — with every test on both sides still green.
 */
private const val LOCALITY_WIRE_JSON = """[{"name":"Richmond","state":"VIC","postcode":"3121"}]"""

class LocalityWireContractTest {

    // The app's real client config: unknown keys are tolerated so a field the backend adds later
    // cannot crash a shipped app (versioning-policy rule 4).
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun deserialisesTheExactBytesGoSends() {
        val places = json.decodeFromString<List<LocalityDTO>>(LOCALITY_WIRE_JSON)

        assertEquals(1, places.size)
        assertEquals("Richmond", places[0].name)
        assertEquals("VIC", places[0].state)
        assertEquals("3121", places[0].postcode)
    }

    /**
     * ⚠ All three fields identify the place, and none may go missing. A `LocalityDTO` without its
     * state is two different places on the wire — there is a Richmond in VIC and a Richmond in NSW
     * (FR-008). If the generated Kotlin ever makes one of these nullable, this fails to compile,
     * which is the outcome we want.
     *
     * ⚠ **This asserts the key SET, not the byte order, and the distinction is deliberate.** The
     * Kotlin generator emits properties alphabetically (`name, postcode, state`) while Go emits them
     * in declaration order (`name, state, postcode`). JSON objects are unordered, this endpoint is
     * READ-ONLY — mobile never sends a locality — so byte-identity in this direction would be a
     * stronger claim than the contract actually makes, and pinning it would fail on a difference that
     * harms nobody. The claim that matters is `deserialisesTheExactBytesGoSends` above.
     */
    @Test
    fun carriesExactlyTheThreeAgreedKeys() {
        val places = json.decodeFromString<List<LocalityDTO>>(LOCALITY_WIRE_JSON)
        val emitted = json.encodeToString(places)

        for (key in listOf("\"name\"", "\"state\"", "\"postcode\"")) {
            assertTrue(emitted.contains(key), "key $key vanished from the Kotlin payload: $emitted")
        }
        // No field may be dropped when empty, and none may be added.
        assertEquals(3, Regex("\"[a-zA-Z]+\":").findAll(emitted).count(), "key count changed: $emitted")
    }

    /**
     * An empty result is `[]`, and it means "no place matches" — **not** "we don't deliver there".
     * The two are different answers to different questions and the client must never conflate them
     * (FR-012). Pinned here because the Go handler deliberately builds a zero-length slice rather
     * than letting a nil marshal to `null`.
     */
    @Test
    fun anEmptyResultIsAnEmptyListNotNull() {
        val places = json.decodeFromString<List<LocalityDTO>>("[]")
        assertEquals(0, places.size)
    }

    /**
     * ⚠ A leading-zero postcode must survive the round trip as a STRING. NT postcodes begin `08xx`,
     * and the moment anything treats this field as a number `0800` becomes `800` and the entire
     * Northern Territory stops being findable. The Go side rejects such rows at load time; this is
     * the client-side half of the same guarantee.
     */
    @Test
    fun preservesLeadingZeroPostcodes() {
        val wire = """[{"name":"Darwin","state":"NT","postcode":"0800"}]"""
        val places = json.decodeFromString<List<LocalityDTO>>(wire)

        assertEquals("0800", places[0].postcode)
        // ⚠ And it is still a QUOTED string on the way back out. The moment this field becomes a
        // number anywhere in the chain, `0800` collapses to `800`. Asserting the quotes is asserting
        // that it never became one.
        assertTrue(
            json.encodeToString(places).contains("\"postcode\":\"0800\""),
            "postcode stopped being a quoted string: ${json.encodeToString(places)}",
        )
    }
}
