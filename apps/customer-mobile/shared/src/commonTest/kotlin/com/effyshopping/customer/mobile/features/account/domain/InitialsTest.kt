package com.effyshopping.customer.mobile.features.account.domain

import kotlin.test.Test
import kotlin.test.assertEquals

/** SC-013 — the avatar must render for EVERY name shape, and never guess from the email. */
class InitialsTest {

    @Test fun twoNames() = assertEquals("AL", initialsFor("Ada", "Lovelace"))

    @Test fun oneName() = assertEquals("A", initialsFor("Ada", null))

    @Test fun familyOnly() = assertEquals("L", initialsFor(null, "Lovelace"))

    @Test fun noName_isNeutralGlyph_neverEmail() = assertEquals("—", initialsFor(null, null))

    @Test fun blankIsTreatedAsAbsent() = assertEquals("—", initialsFor("  ", ""))

    @Test fun nonLatinGraphemes() = assertEquals("李明", initialsFor("李", "明"))

    @Test fun lowercaseIsUppercased() = assertEquals("AL", initialsFor("ada", "lovelace"))

    @Test fun emojiIsOneGrapheme_notHalfASurrogatePair() {
        // 👩‍🚀 = U+1F469 ZWJ U+1F680 — one user-perceived character.
        val astronaut = "👩‍🚀"
        assertEquals(astronaut, initialsFor(astronaut, null))
    }

    @Test fun combiningMarkStaysWithItsBase() {
        // "e" + combining acute accent should come back as the single é grapheme.
        assertEquals("É", initialsFor("élise", null))
    }

    @Test fun surrogatePairName() {
        // A name starting with an astral-plane letter (𝒜, U+1D49C) must not split.
        assertEquals("𝒜", initialsFor("𝒜da", null))
    }
}
