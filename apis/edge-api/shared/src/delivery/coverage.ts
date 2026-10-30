import type { CoverageKind } from "@effy/shared-types";

import type { Queryable } from "../lib/db";

/** Why a postcode has its answer: staff only. A customer is told the answer, never the reason. */
export type CoverageReason =
  | "listed" | "courier_offered" | "courier_off" | "courier_excluded" | "unknown_postcode"
  /** Courier delivery is on, but no fee table or default courier service is active. */
  | "courier_not_ready";

export interface Coverage {
  kind: CoverageKind;
  reason: CoverageReason;
  /** Straight-line km from the hub, listed postcodes only. Never on a customer contract. */
  distanceKm: number | null;
  /** Listed postcodes only. */
  groupId: string | null;
  groupName: string | null;
  /** Whether a window today may be sold here; meaningful only for `effy` (else true). Passed to `effyDays`. */
  todayOffered: boolean;
}

/**
 * The coverage answer for a normalised four-digit postcode, from `public.coverage_for_postcode`
 * only (`coverage.guard.test.ts` fails a new reader of the list's table). "courier" means a courier order
 * can be placed now: courier on, a fee table active, a default service set.
 */
export async function coverageForPostcode(q: Queryable, postcode: string): Promise<Coverage> {
  const row = (
    await q.query<{
      kind: CoverageKind; reason: CoverageReason; distance_km: string | null; group_id: string | null; group_name: string | null;
      today_offered: boolean;
    }>(
      `SELECT kind, reason, distance_km::text AS distance_km, group_id::text AS group_id, group_name, today_offered
         FROM public.coverage_for_postcode($1)`,
      [postcode],
    )
  ).rows[0];
  // The function always returns exactly one row.
  if (!row) return { kind: "none", reason: "unknown_postcode", distanceKm: null, groupId: null, groupName: null, todayOffered: true };
  return {
    kind: row.kind,
    reason: row.reason,
    distanceKm: row.distance_km === null ? null : Number(row.distance_km),
    groupId: row.group_id,
    groupName: row.group_name,
    todayOffered: row.today_offered,
  };
}

/**
 * Can a courier order be placed here, whether or not Effy delivers? Asked by checkout only for
 * a listed address with no window left, through the same SQL function.
 */
export async function courierReachesPostcode(q: Queryable, postcode: string): Promise<boolean> {
  const row = (
    await q.query<{ reason: string }>(`SELECT public.courier_reaches_postcode($1) AS reason`, [postcode])
  ).rows[0];
  return row?.reason === "courier_offered";
}

/** What the business set for courier delivery that checkout tells or acts on. */
export interface CourierSettings {
  /** The default courier service's timeframe ("2–4 business days"); null with no active default. */
  estimateText: string | null;
  /** The service the order records it was told about. */
  defaultServiceId: string | null;
  /** How new courier orders reach the courier. */
  collectionDefault: "hub" | "supplier";
  /** Send an order by courier when its address has no Effy window left. */
  whenNoWindows: boolean;
}

/** Read only on the courier paths of the quote. */
export async function loadCourierSettings(q: Queryable): Promise<CourierSettings> {
  const row = (
    await q.query<{ courier_when_no_windows: boolean; courier_collection_default: "hub" | "supplier"; id: string | null; estimate_text: string | null }>(
      `SELECT s.courier_when_no_windows, s.courier_collection_default, d.id::text AS id, d.estimate_text
         FROM public.delivery_settings s
    -- availability-exempt: public.courier_service - a courier service's lifecycle, not a product's.
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
