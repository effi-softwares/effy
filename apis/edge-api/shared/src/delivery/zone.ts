import type { Queryable } from "../lib/db";

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
 * THE serviceability predicate (047 FR-001): serviced ⇔ the postcode belongs to an ACTIVE delivery
 * zone. The checkout quote resolves its zone from the same join, so the up-front answer and the
 * quote can never disagree (FR-004).
 */
export async function serviceableForPostcode(q: Queryable, postcode: string): Promise<boolean> {
  const res = await q.query<{ serviced: boolean }>(
    `
		SELECT EXISTS (
			SELECT 1
			FROM public.delivery_zone_postcode zp
			JOIN public.delivery_zone z ON z.id = zp.zone_id
			-- availability-exempt: public.delivery_zone — a serving area's lifecycle.
			WHERE zp.postcode = $1 AND z.status = 'active'
		) AS serviced`,
    [postcode],
  );
  return res.rows[0]?.serviced === true;
}

/** The resolved active zone for a destination postcode. */
export interface Zone {
  id: string;
  /** The distance tier the quote prices on. */
  ringId: string;
  /** Same-day eligible by default (047 FR-037). */
  sameDayEligible: boolean;
}

/** `null` (no error) when the postcode is in no active zone. */
export async function zoneForPostcode(q: Queryable, postcode: string): Promise<Zone | null> {
  const row = (
    await q.query<{ id: string; ring_id: string; sameday_eligible: boolean }>(
      `
		SELECT z.id::text AS id, z.ring_id::text AS ring_id, z.sameday_eligible
		FROM public.delivery_zone_postcode zp
		JOIN public.delivery_zone z ON z.id = zp.zone_id
		-- availability-exempt: public.delivery_zone — a serving area's lifecycle.
		WHERE zp.postcode = $1 AND z.status = 'active'`,
      [postcode],
    )
  ).rows[0];
  return row ? { id: row.id, ringId: row.ring_id, sameDayEligible: row.sameday_eligible } : null;
}

/**
 * The per-(shop, zone) same-day decision (047 FR-044): a shop is offered same-day iff an exception
 * says so, else the zone default.
 */
export async function sameDayForShops(
  q: Queryable,
  zoneId: string,
  zoneDefault: boolean,
  shopIds: readonly string[],
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>(shopIds.map((id) => [id, zoneDefault]));
  if (shopIds.length === 0) return out;

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
