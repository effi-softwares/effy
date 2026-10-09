// The driver's own work — data layer (063). Rows are mapped to the wire contract here and never leak.

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
  /** 069 — the customer's delivery window. Null unless this is a drop for a windowed order. */
  window_start: Date | null;
  window_end: Date | null;
}

export interface PackageRow {
  round_package_id: string;
  stop_id: string;
  state: string;
  package_id: string;
  order_number: string;
  method: "standard" | "same_day";
  delivered_by: "effy" | "courier";
  window_start: Date | null;
  window_end: Date | null;
  destination_suburb: string | null;
}


/** ⚠ One line a driver can read and hand to their maps app (D7). Never a coordinate. */
export function addressLine(parts: ReadonlyArray<string | null>): string | null {
  const line = parts.filter((p): p is string => typeof p === "string" && p.trim() !== "").join(", ");
  return line === "" ? null : line;
}

/** A round with what the driver's home needs to say about it (072). */
export interface OpenRoundRow extends RoundRow {
  /** Null once the round is open — decided by the database's clock, never the phone's. */
  opens_at: Date | null;
  stop_count: number;
  package_count: number;
}

/** Every unfinished round the driver holds, the current one first (072). */
export async function openRounds(driverId: string): Promise<OpenRoundRow[]> {
  const res = await query<OpenRoundRow>(OPEN_ROUNDS, [driverId]);
  return res.rows;
}

/**
 * When a round opens, as the wire says it (072): the instant and the same moment in words, or null
 * once the round is open. ⚠ THE LABEL IS WRITTEN HERE, in Melbourne time — the driver app has no
 * timezone database and never formats a time (see `DeliveryWindow.kt`).
 */
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

/** When one of the driver's rounds opens and is due; null when it is not theirs (FR-038). */
export async function roundTimes(roundId: string, driverId: string): Promise<RoundTimes | null> {
  const res = await query<{ deadline_at: Date; opens_at: Date | null }>(ROUND_TIMES, [roundId, driverId]);
  return toTimes(res.rows[0]);
}

/** The same, from one of the round's stops. */
export async function stopRoundTimes(stopId: string, driverId: string): Promise<RoundTimes | null> {
  const res = await query<{ deadline_at: Date; opens_at: Date | null }>(STOP_ROUND_TIMES, [stopId, driverId]);
  return toTimes(res.rows[0]);
}

export async function completedToday(driverId: string): Promise<RoundRow[]> {
  const res = await query<RoundRow>(COMPLETED_TODAY, [driverId]);
  return res.rows;
}

/** ⚠ Both ids are required — the round must belong to the caller (FR-038). */
export async function roundStops(roundId: string, driverId: string): Promise<StopRow[]> {
  const res = await query<StopRow>(ROUND_STOPS, [roundId, driverId]);
  return res.rows;
}

export async function roundPackages(roundId: string, driverId: string): Promise<PackageRow[]> {
  const res = await query<PackageRow>(ROUND_PACKAGES, [roundId, driverId]);
  return res.rows;
}

export async function packageItems(packageIds: string[]): Promise<ManifestRow[]> {
  if (packageIds.length === 0) return [];
  const res = await query<ManifestRow>(PACKAGE_ITEMS, [packageIds]);
  return res.rows;
}

/** The package ids at one stop, in the stable order the app labels by position (065). */
export async function stopPackageIds(stopId: string, driverId: string): Promise<string[]> {
  const res = await query<{ package_id: string }>(STOP_PACKAGES, [stopId, driverId]);
  return res.rows.map((r) => r.package_id);
}
