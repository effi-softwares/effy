/**
 * How a set delivery location is written out (030 FR-033/FR-034/FR-034a/FR-034b).
 *
 * ONE rule, stated once here and mirrored by `DeliveryDisplay.kt` on mobile. Both are unit-tested
 * against the SAME four-row table in
 * `specs/030-delivery-location-suburb/contracts/locality.contract.md` §2 — against the table, not
 * against whatever the implementation happens to do. 028 and 029 both shipped tests whose fixtures
 * agreed with the code rather than with the world; this is the counter-measure.
 *
 * | locality | state | renders as         | when                                            |
 * |----------|-------|--------------------|-------------------------------------------------|
 * | Richmond | VIC   | Richmond VIC 3121  | the shopper chose a place from the list          |
 * | null     | VIC   | VIC 3121           | bare postcode covering SEVERAL localities        |
 * | Melbourne| VIC   | Melbourne VIC 3000 | bare postcode covering EXACTLY ONE locality      |
 * | null     | null  | 3121               | the locality lookup failed                       |
 *
 * ⚠ Row 2 is FR-034: a postcode covering several suburbs must NOT have one invented for it. The
 * shopper typed digits; naming one of the candidates asserts a choice they never made.
 *
 * ⚠ Row 4 is FR-034b: not knowing what a postcode is CALLED must never stop us answering whether we
 * DELIVER there. The verdict is independent of this function.
 *
 * ⚠ It never returns an empty string for a set location — a location that renders as nothing is
 * indistinguishable from no location at all.
 */
export interface DisplayablePlace {
  postcode: string
  locality?: string | null
  state?: string | null
}

export function formatPlace(place: DisplayablePlace): string {
  const parts: string[] = []
  if (place.locality) parts.push(place.locality)
  if (place.state) parts.push(place.state)
  parts.push(place.postcode)
  return parts.join(" ")
}

/**
 * The same place, phrased for a screen reader.
 *
 * ⚠ FR-042: it must name the place in the SAME words the visible display uses. A sighted and a
 * non-sighted shopper being told about differently-worded places is the same defect as showing the
 * wrong place, and it is the kind of thing that drifts the moment the two are written separately —
 * so this is built FROM `formatPlace`, not alongside it.
 */
export function announcePlace(place: DisplayablePlace, serviced: boolean | null): string {
  const where = formatPlace(place)
  if (serviced === true) return `Effy delivers to ${where}.`
  if (serviced === false) return `Effy does not deliver to ${where} yet.`
  return ""
}
