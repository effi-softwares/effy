/**
 * Initials, for the avatar (012 FR-002 / FR-003, research R10).
 *
 * ⚠ THE FAILURE MODES HERE ARE ALL *OTHER PEOPLE'S NAMES*, and every one of them is avoidable by
 * refusing to be clever:
 *
 *   • `str[0]` SPLITS SURROGATE PAIRS. "👨‍👩‍👧 Smith"[0] is half an emoji — a replacement glyph,
 *     rendered to a real customer, forever. Use `Intl.Segmenter` and take the leading GRAPHEME.
 *
 *   • A SINGLE CJK OR ARABIC CHARACTER IS NOT AN "INITIAL". It is the whole name, or a fragment of
 *     one, and showing it in a circle is noise at best and mangled at worst. We do not have a
 *     defensible initials algorithm for scripts we cannot reason about, so we do not pretend to:
 *     we fall back to a neutral symbol.
 *
 *   • `toUpperCase()` GETS TURKISH WRONG. The dotless ı uppercases to I in en-US and to İ in tr.
 *     `toLocaleUpperCase()` respects the runtime locale.
 *
 *   • NEVER GUESS A LETTER FROM THE EMAIL. It is the tempting fallback for a customer with no name
 *     — and it shows a stranger's initial (from an address like `shopping@…`) to someone whose name
 *     we simply do not have. A neutral glyph is honest; a wrong letter is not.
 *
 * Two initials maximum (first + last). A ONE-WORD name yields ONE initial — never two letters taken
 * from the same word, which is how you get "CH" for "Cher".
 */

/** `null` means: render the neutral person glyph. It is a legitimate answer, not a failure. */
export function initialsFor(
  givenName: string | null | undefined,
  familyName: string | null | undefined,
): string | null {
  const first = leadingLetter(givenName)
  const last = leadingLetter(familyName)

  if (first && last) return first + last
  if (first) return first // one name → ONE initial
  if (last) return last
  return null
}

/**
 * The leading grapheme of a name, uppercased — or null if it is not a letter we can use.
 *
 * "A letter we can use" means: Latin. That is a deliberate narrowing, not Anglocentrism by
 * accident — see the header. Everything else gets the neutral glyph, which is the honest answer.
 */
function leadingLetter(raw: string | null | undefined): string | null {
  if (!raw) return null

  const trimmed = raw.trim()
  if (!trimmed) return null

  const grapheme = firstGrapheme(trimmed)
  if (!grapheme) return null

  // Latin letters only. `\p{Script=Latin}` excludes digits, punctuation, emoji, CJK, Arabic,
  // Devanagari, Cyrillic, Greek — everything for which a single leading character is not an
  // "initial" in the sense a customer would recognise.
  //
  // ⚠ The `u` flag is required for `\p{...}` to mean anything at all. Without it this silently
  // becomes a literal-character class and matches almost nothing.
  if (!/^\p{Script=Latin}$/u.test(stripMarks(grapheme))) return null

  return grapheme.toLocaleUpperCase()
}

/** The first user-perceived character — NOT the first UTF-16 code unit. */
function firstGrapheme(s: string): string | undefined {
  // Node 22 and every target browser have Intl.Segmenter. The fallback exists so a missing
  // Segmenter degrades to "no initial" (the neutral glyph) rather than to a mangled one.
  if (typeof Intl?.Segmenter !== "function") return undefined

  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })
  for (const { segment } of segmenter.segment(s)) return segment
  return undefined
}

/**
 * Drop combining marks before the script test.
 *
 * "Ángela" leads with a grapheme that may be `A` + U+0301 (combining acute) rather than the
 * precomposed `Á`. Without this, the script test sees a two-code-point cluster, fails, and a
 * perfectly ordinary Spanish name silently loses its initial.
 */
function stripMarks(g: string): string {
  return g.normalize("NFD").replace(/\p{Mark}/gu, "")
}
