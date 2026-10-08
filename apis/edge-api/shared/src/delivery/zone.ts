import type { Queryable } from "../lib/db";
import { coverageForPostcode } from "./coverage";

const POSTCODE = /^[0-9]{4}$/;

/**
 * Trim and validate an Australian 4-digit postcode. `null` for anything that is not exactly four
 * digits after trimming — a malformed postcode is a 400, NEVER "we don't deliver there".
 */
export function normalizePostcode(input: string): string | null {
  const s = input.trim();
  return POSTCODE.test(s) ? s : null;
}

/**
 * Can an order be placed for delivery to this postcode TODAY? (047 FR-001, rebuilt by 076.)
 *
 * ⚠ It asks `coverageForPostcode` — it has no join of its own — so the up-front answer, the address
 * book and the quote cannot disagree. True only for `effy`: a `courier` answer is not something the
 * checkout can sell until the courier checkout exists (`COURIER_ORDERING_AVAILABLE`).
 */
export async function serviceableForPostcode(q: Queryable, postcode: string): Promise<boolean> {
  return (await coverageForPostcode(q, postcode)).kind === "effy";
}

/**
 * What the LIVE quote still needs to know about a listed postcode beyond its distance: its group,
 * and whether same-day is on there.
 *
 * ⚠ THE SAME-DAY FLAG IS A BRIDGE. 076 took the controls for same-day zones out of the console, but
 * the live checkout still sells same-day/standard until the checkout feature (E5) replaces it. So
 * the old answer is kept, frozen, for the groups that had one, and is "yes" for everything since.
 * ⚠ The FEE-TIER bridge that stood beside it ended with 077: a postcode is priced from its own
 * distance (`coverageForPostcode(...).distanceKm`), and no reader of a tier may come back.
 */
export interface Zone {
  /**
   * The postcode's group (the old "zone"), or null when it is in none. ⚠ Per-shop same-day
   * exceptions are keyed on it, so an ungrouped postcode has none.
   */
  id: string | null;
  /** Same-day eligible by default (047 FR-037). */
  sameDayEligible: boolean;
}

/** `null` (no error) when the postcode is not on Effy's list. */
export async function zoneForPostcode(q: Queryable, postcode: string): Promise<Zone | null> {
  const row = (
    await q.query<{ id: string | null; sameday_eligible: boolean }>(
      `
		SELECT z.id::text AS id,
		       -- BRIDGE until the checkout feature (E5): a pre-076 group keeps its flag; everything
		       -- else is same-day eligible, as the whole list is under the new model.
		       COALESCE(z.sameday_eligible, true) AS sameday_eligible
		FROM public.delivery_zone_postcode zp
		-- availability-exempt: public.delivery_zone — a coverage group's lifecycle, not a product's.
		LEFT JOIN public.delivery_zone z ON z.id = zp.zone_id AND z.status = 'active'
		WHERE zp.postcode = $1`,
      [postcode],
    )
  ).rows[0];
  return row ? { id: row.id, sameDayEligible: row.sameday_eligible } : null;
}

/**
 * The per-(shop, zone) same-day decision (047 FR-044): a shop is offered same-day iff an exception
 * says so, else the zone default.
 */
export async function sameDayForShops(
  q: Queryable,
  zoneId: string | null,
  zoneDefault: boolean,
  shopIds: readonly string[],
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>(shopIds.map((id) => [id, zoneDefault]));
  // No group, no exceptions: they are keyed on one (and frozen since 076 — removed by E5).
  if (shopIds.length === 0 || zoneId === null) return out;

  const rows = await q.query<{ shop_id: string; mode: string }>(
    `
		SELECT shop_id::text AS shop_id, mode
		FROM public.shop_sameday_exception
		WHERE zone_id = $1 AND shop_id = ANY($2::uuid[])`,
    [zoneId, shopIds],
  );
  // An exception overrides the zone default (FR-043).
  for (const r of rows.rows) out.set(r.shop_id, r.mode === "on");
  return out;
}
