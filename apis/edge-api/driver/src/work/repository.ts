import { query } from "@effy/edge-shared";
import { formatMoment, type RoundOpening } from "@effy/shared-types";

import {
  COMPLETED_TODAY,
  OPEN_ROUNDS,
  PACKAGE_ITEMS,
  ROUND_PACKAGES,
  ROUND_STOPS,
  ROUND_TIMES,
  STOP_PACKAGES,
  STOP_ROUND_TIMES,
} from "./sql";
import type { ManifestRow } from "./manifest";

export interface RoundRow {
  id: string;
  kind: "collection" | "delivery";
  status: string;
  deadline_at: Date;
  changed_note: string | null;
}

export interface StopRow {
  stop_id: string;
  seq: number | null;
  stop_kind: "shop_pickup" | "customer_drop" | "hub_checkin";
  stop_status: "pending" | "out_for_delivery" | "en_route" | "arrived" | "done" | "skipped";
  completed_at: Date | null;
  zone_id: string | null;
  zone_name: string | null;
  shop_id: string | null;
  shop_name: string | null;
  shop_code: string | null;
  address_line1: string | null;
  address_line2: string | null;
  suburb: string | null;
  postcode: string | null;
  state: string | null;
  order_id: string | null;
  order_number: string | null;
  destination_suburb: string | null;
  destination_line1: string | null;
  destination_line2: string | null;
  destination_postcode: string | null;
  destination_state: string | null;
  /** Null unless this is a drop for a windowed order. */
  window_start: Date | null;
  window_end: Date | null;
  /** Sold a day with no time. */
  any_time?: boolean;
  handover?: "leave_at_door" | "meet_at_door" | null;
}

export interface PackageRow {
  round_package_id: string;
  stop_id: string;
  state: string;
  package_id: string;
  /** Printed on the package's label. */
  package_code: string;
  order_number: string;
  delivered_by: "effy" | "courier";
  window_start: Date | null;
  window_end: Date | null;
  /** Sold a day with no time. */
  any_time?: boolean;
  destination_suburb: string | null;
}

/** One line for the driver's maps app. Never a coordinate. */
export function addressLine(parts: ReadonlyArray<string | null>): string | null {
  const line = parts.filter((p): p is string => typeof p === "string" && p.trim() !== "").join(", ");
  return line === "" ? null : line;
}

export interface OpenRoundRow extends RoundRow {
  /** Null once open, by the database's clock. */
  opens_at: Date | null;
  stop_count: number;
  package_count: number;
}

/** The current one first. */
export async function openRounds(driverId: string): Promise<OpenRoundRow[]> {
  const res = await query<OpenRoundRow>(OPEN_ROUNDS, [driverId]);
  return res.rows;
}

/** The instant and its Melbourne label, or null once open. The app never formats a time. */
export function openingOf(opensAt: Date | null, now: Date = new Date()): RoundOpening | null {
  return opensAt ? { at: opensAt.toISOString(), label: formatMoment(opensAt, now) } : null;
}

export interface RoundTimes {
  opening: RoundOpening | null;
  deadlineAt: string;
  dueLabel: string;
}

function toTimes(r: { deadline_at: Date; opens_at: Date | null } | undefined): RoundTimes | null {
  if (!r) return null;
  const now = new Date();
  return {
    opening: openingOf(r.opens_at, now),
    deadlineAt: r.deadline_at.toISOString(),
    dueLabel: formatMoment(r.deadline_at, now),
  };
}

/** Null when the round is not theirs. */
export async function roundTimes(roundId: string, driverId: string): Promise<RoundTimes | null> {
  const res = await query<{ deadline_at: Date; opens_at: Date | null }>(ROUND_TIMES, [roundId, driverId]);
  return toTimes(res.rows[0]);
}

export async function stopRoundTimes(stopId: string, driverId: string): Promise<RoundTimes | null> {
  const res = await query<{ deadline_at: Date; opens_at: Date | null }>(STOP_ROUND_TIMES, [stopId, driverId]);
  return toTimes(res.rows[0]);
}

export async function completedToday(driverId: string): Promise<RoundRow[]> {
  const res = await query<RoundRow>(COMPLETED_TODAY, [driverId]);
  return res.rows;
}

/** Both ids are required: the round must belong to the caller. */
export async function roundStops(roundId: string, driverId: string): Promise<StopRow[]> {
  const res = await query<StopRow>(ROUND_STOPS, [roundId, driverId]);
  return res.rows;
}

export async function roundPackages(roundId: string, driverId: string): Promise<PackageRow[]> {
  const res = await query<PackageRow>(ROUND_PACKAGES, [roundId, driverId]);
  return res.rows;
}

/** Each finished drop's proof method, or why it failed. */
export async function stopOutcomes(roundId: string): Promise<Map<string, { method: string | null; reason: string | null }>> {
  const res = await query<{ stop_id: string; method: string | null; reason: string | null }>(
    `SELECT rs.id AS stop_id,
            (SELECT dp.method FROM public.delivery_proof dp WHERE dp.stop_id = rs.id ORDER BY dp.captured_at DESC LIMIT 1) AS method,
            (SELECT f.reason FROM public.delivery_attempt_failure f WHERE f.stop_id = rs.id ORDER BY f.failed_at DESC LIMIT 1) AS reason
       FROM public.round_stop rs
      WHERE rs.round_id = $1 AND rs.kind = 'customer_drop'`,
    [roundId],
  );
  return new Map(res.rows.map((r) => [r.stop_id, { method: r.method, reason: r.reason }]));
}

export async function packageItems(packageIds: string[]): Promise<ManifestRow[]> {
  if (packageIds.length === 0) return [];
  const res = await query<ManifestRow>(PACKAGE_ITEMS, [packageIds]);
  return res.rows;
}

/** In the stable order the app labels by position. */
export async function stopPackageIds(stopId: string, driverId: string): Promise<string[]> {
  const res = await query<{ package_id: string }>(STOP_PACKAGES, [stopId, driverId]);
  return res.rows.map((r) => r.package_id);
}

export async function packageCodes(packageIds: string[]): Promise<Map<string, string>> {
  if (packageIds.length === 0) return new Map();
  const res = await query<{ id: string; package_code: string }>(
    `SELECT id::text AS id, package_code FROM public.shop_fulfillment WHERE id = ANY($1::uuid[])`,
    [packageIds],
  );
  return new Map(res.rows.map((r) => [r.id, r.package_code]));
}
