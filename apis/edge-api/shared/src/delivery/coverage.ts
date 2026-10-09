import type { CoverageKind } from "@effy/shared-types";

import type { Queryable } from "../lib/db";

/**
 * Why a postcode has the answer it has — for STAFF. A customer is told the answer and never the
 * reason (076 FR-023).
 */
export type CoverageReason =
  | "listed" | "courier_offered" | "courier_off" | "courier_excluded" | "unknown_postcode"
  /** 079 — courier delivery is on and ready, and starts when the new delivery model does. */
  | "courier_pending"
  /** 079 — courier delivery is on, but no courier fee table is active or no estimate is set. */
  | "courier_not_ready";

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
 * THE coverage answer for a postcode (076 FR-019/FR-020) at `now`.
 *
 * ⚠ One query on `public.coverage_for_postcode`, which is the ONLY place the decision is made. Do
 * not join `delivery_zone_postcode` to work it out somewhere else: `coverage.guard.test.ts` fails a
 * new reader of that table, because a second implementation is how the address book and the
 * checkout come to disagree. The caller passes a normalised four-digit postcode.
 *
 * ⚠ "courier" MEANS A COURIER ORDER CAN BE PLACED THERE NOW (079 FR-010): the new delivery model is
 * on at `now`, courier delivery is on, a courier fee table is active and an estimate is set. Until
 * 079 that was held by a constant three callers had to remember to check; it is now part of the
 * answer, so there is nothing to remember — and courier delivery can be switched on ahead of the
 * cutover without promising anything.
 */
export async function coverageForPostcode(q: Queryable, postcode: string, now: Date = new Date()): Promise<Coverage> {
  const row = (
    await q.query<{ kind: CoverageKind; reason: CoverageReason; distance_km: string | null; group_id: string | null; group_name: string | null }>(
      `SELECT kind, reason, distance_km::text AS distance_km, group_id::text AS group_id, group_name
         FROM public.coverage_for_postcode($1, $2::timestamptz)`,
      [postcode, now],
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

/**
 * Can a courier order be placed to this postcode at `now` — whether or not Effy delivers there?
 *
 * ⚠ `coverageForPostcode` never asks this of a postcode on Effy's list (Effy delivers; nothing else
 * is consulted). The checkout asks it for exactly one case: a listed address with no delivery
 * window left, when the business sends such an order by courier (079 FR-011). Same SQL function the
 * coverage answer uses for an unlisted postcode — one definition of "a courier can be booked there".
 */
export async function courierReachesPostcode(q: Queryable, postcode: string, now: Date): Promise<boolean> {
  const row = (
    await q.query<{ reason: string }>(`SELECT public.courier_reaches_postcode($1, $2::timestamptz) AS reason`, [postcode, now])
  ).rows[0];
  return row?.reason === "courier_offered";
}

/** What the business has set for courier delivery that the checkout tells a customer or acts on. */
export interface CourierSettings {
  /**
   * The DEFAULT courier service's timeframe ("2–4 business days") — what a courier customer is told
   * (080; 079's single platform text is no longer read). Null when there is no active default.
   */
  estimateText: string | null;
  /** 080 — the default service the order records it was told about. */
  defaultServiceId: string | null;
  /** 080 — how new courier orders reach the courier. */
  collectionDefault: "hub" | "supplier";
  /** Send an order by courier when its address has no Effy delivery window left (079 FR-011). */
  whenNoWindows: boolean;
}

/**
 * ⚠ Read ONLY on the courier paths of the quote — never by the checkout customers are using before
 * the cutover.
 */
export async function loadCourierSettings(q: Queryable): Promise<CourierSettings> {
  const row = (
    await q.query<{ courier_when_no_windows: boolean; courier_collection_default: "hub" | "supplier"; id: string | null; estimate_text: string | null }>(
      `SELECT s.courier_when_no_windows, s.courier_collection_default, d.id::text AS id, d.estimate_text
         FROM public.delivery_settings s
    -- availability-exempt: public.courier_service — a courier service's lifecycle, not a product's.
    LEFT JOIN public.courier_service d ON d.is_default AND d.status = 'active'
        WHERE s.id = 1`,
    )
  ).rows[0];
  return {
    estimateText: row?.estimate_text ?? null,
    defaultServiceId: row?.id ?? null,
    collectionDefault: row?.courier_collection_default ?? "hub",
    whenNoWindows: row?.courier_when_no_windows ?? false,
  };
}
