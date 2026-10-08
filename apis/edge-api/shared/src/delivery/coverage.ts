import type { CoverageKind } from "@effy/shared-types";

import type { Queryable } from "../lib/db";

/**
 * Why a postcode has the answer it has — for STAFF. A customer is told the answer and never the
 * reason (076 FR-023).
 */
export type CoverageReason = "listed" | "courier_offered" | "courier_off" | "courier_excluded" | "unknown_postcode";

/** Who delivers to a postcode, with what staff may see about it. */
export interface Coverage {
  kind: CoverageKind;
  reason: CoverageReason;
  /** Straight-line km from the hub — listed postcodes only. ⚠ Never put this on a customer contract. */
  distanceKm: number | null;
  /** The group the postcode is filed under, if any — listed postcodes only. */
  groupId: string | null;
  groupName: string | null;
}

/**
 * ⚠ CAN A CUSTOMER PLACE A COURIER ORDER YET? No — and until they can, courier delivery cannot be
 * switched on (076 research R7).
 *
 * `coverage_for_postcode` answers "courier" for every unlisted postcode in the country the moment
 * `delivery_settings.courier_offered` is true. The checkout cannot sell one until the courier
 * checkout exists (the delivery programme's E5). Turned on early, every address screen would say
 * "Courier delivery" and every checkout would refuse — the one-answer rule (FR-020) broken by a
 * setting. So the admin service refuses the switch while this is false, and the quote treats a
 * courier answer as a broken invariant rather than as something to sell.
 *
 * E5 flips this to true in the same change that makes the order placeable.
 */
export const COURIER_ORDERING_AVAILABLE: boolean = false;

/**
 * THE coverage answer for a postcode (076 FR-019/FR-020).
 *
 * ⚠ One query on `public.coverage_for_postcode`, which is the ONLY place the decision is made. Do
 * not join `delivery_zone_postcode` to work it out somewhere else: `coverage.guard.test.ts` fails a
 * new reader of that table, because a second implementation is how the address book and the
 * checkout come to disagree. The caller passes a normalised four-digit postcode.
 */
export async function coverageForPostcode(q: Queryable, postcode: string): Promise<Coverage> {
  const row = (
    await q.query<{ kind: CoverageKind; reason: CoverageReason; distance_km: string | null; group_id: string | null; group_name: string | null }>(
      `SELECT kind, reason, distance_km::text AS distance_km, group_id::text AS group_id, group_name
         FROM public.coverage_for_postcode($1)`,
      [postcode],
    )
  ).rows[0];
  // The function always returns exactly one row; this is for a database that predates it.
  if (!row) return { kind: "none", reason: "unknown_postcode", distanceKm: null, groupId: null, groupName: null };
  return {
    kind: row.kind,
    reason: row.reason,
    distanceKm: row.distance_km === null ? null : Number(row.distance_km),
    groupId: row.group_id,
    groupName: row.group_name,
  };
}
