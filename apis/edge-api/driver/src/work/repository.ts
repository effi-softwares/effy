// The driver's own work — data layer (063). Rows are mapped to the wire contract here and never leak.

import { query } from "@effy/edge-shared";

import {
  COMPLETED_TODAY,
  CURRENT_ROUND,
  OWNS_ROUND,
  PACKAGE_ITEMS,
  ROUND_PACKAGES,
  ROUND_STOPS,
} from "./sql";

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
  stop_status: "pending" | "arrived" | "done" | "skipped";
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
}

export interface PackageRow {
  round_package_id: string;
  stop_id: string;
  state: string;
  package_id: string;
  order_number: string;
  method: "standard" | "same_day";
  destination_suburb: string | null;
}

export interface ItemRow {
  name: string;
  qty: number;
}

/** ⚠ One line a driver can read and hand to their maps app (D7). Never a coordinate. */
export function addressLine(parts: ReadonlyArray<string | null>): string | null {
  const line = parts.filter((p): p is string => typeof p === "string" && p.trim() !== "").join(", ");
  return line === "" ? null : line;
}

export async function currentRound(driverId: string): Promise<RoundRow | null> {
  const res = await query<RoundRow>(CURRENT_ROUND, [driverId]);
  return res.rows[0] ?? null;
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

export async function packageItems(packageIds: string[]): Promise<ItemRow[]> {
  if (packageIds.length === 0) return [];
  const res = await query<ItemRow>(PACKAGE_ITEMS, [packageIds]);
  return res.rows;
}

/**
 * Does this driver own this round?
 *
 * ⚠ The caller must answer `false` EXACTLY as it answers "no such round" (FR-038). Distinguishing
 * them turns the route into an oracle for which ids exist — 052's byte-identical refusals.
 */
export async function ownsRound(roundId: string, driverId: string): Promise<boolean> {
  const res = await query(OWNS_ROUND, [roundId, driverId]);
  return (res.rowCount ?? 0) > 0;
}
