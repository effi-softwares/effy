package com.effyshopping.customer.mobile.features.account.domain

/**
 * The initials for a customer's avatar (013 data-model § 3; SC-013). The ONE place initials are
 * derived. It must render correctly for every name shape and **never** guess letters from the email.
 *
 *   "Ada" / "Lovelace"  → "AL"      two names → first grapheme of each
 *   "Ada" / null        → "A"       one name → one initial
 *   null / null         → "—"       an em dash — NEVER the email
 *   "李" / "明"          → "李明"     graphemes, not chars
 *   "👩‍🚀" (given only)   → "👩‍🚀"     one emoji is ONE grapheme (several code points)
 *
 * commonMain has no `BreakIterator`, so [firstGrapheme] is a pragmatic grapheme-cluster segmenter:
 * it extends the first code point across ZWJ sequences, variation selectors, skin-tone modifiers,
 * combining marks, and regional-indicator pairs — enough for names and avatar emoji. A `.first()` on
 * a `Char` would split a surrogate pair and render as `�`, which is exactly the SC-013 failure.
 */
fun initialsFor(given: String?, family: String?): String {
    val g = given?.trim().orEmpty()
    val f = family?.trim().orEmpty()
    val parts = when {
        g.isNotEmpty() && f.isNotEmpty() -> listOf(g, f)
        g.isNotEmpty() -> listOf(g)
        f.isNotEmpty() -> listOf(f)
        else -> return "—" // em dash — a neutral glyph, never derived from the email address
    }
    return parts.joinToString("") { firstGrapheme(it).uppercase() }
}

private const val ZWJ = 0x200D

private fun firstGrapheme(s: String): String {
    if (s.isEmpty()) return ""
    var i = charCount(codePointAt(s, 0))
    while (i < s.length) {
        val cp = codePointAt(s, i)
        when {
            cp == ZWJ -> {
                // A zero-width joiner binds the previous grapheme to the next base (e.g. 👩‍🚀).
                i += charCount(cp)
                if (i < s.length) i += charCount(codePointAt(s, i))
            }
            isExtending(cp) -> i += charCount(cp)
            else -> break
        }
    }
    return s.substring(0, i)
}

/** Code points that continue a grapheme cluster started by a preceding base. */
private fun isExtending(cp: Int): Boolean =
    cp == 0xFE0F ||               // variation selector-16 (renders the preceding char as emoji)
    cp in 0x1F3FB..0x1F3FF ||     // emoji skin-tone modifiers
    cp in 0x0300..0x036F ||       // combining diacritical marks
    cp in 0x1F1E6..0x1F1FF        // regional indicators — a flag is a pair, so the 2nd extends the 1st

/** Decode the Unicode code point at char [index], combining a surrogate pair when present. */
private fun codePointAt(s: String, index: Int): Int {
    val high = s[index]
    if (high.isHighSurrogate() && index + 1 < s.length) {
        val low = s[index + 1]
        if (low.isLowSurrogate()) {
            return 0x10000 + ((high.code - 0xD800) shl 10) + (low.code - 0xDC00)
        }
    }
    return high.code
}

/** How many `Char`s (UTF-16 units) a code point occupies. */
private fun charCount(cp: Int): Int = if (cp >= 0x10000) 2 else 1
