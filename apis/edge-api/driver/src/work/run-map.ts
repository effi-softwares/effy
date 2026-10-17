// THE RUN MAP (092 rev 2, decision D25) — where a run's stops roughly are, for a small schematic map on
// the driver's screens.
//
// ⚠ DISPLAY ONLY. This is the ONE file in the driver service that reads a point (the no-location guard
// names it). A stop's point is its POSTCODE'S PLACE — the locality the platform already holds for
// delivery coverage — chosen by the stop's own suburb when the postcode spans several. Never a geocoded
// address, never a device position (D22), and nothing that orders or assigns work reads it (D20).
// Rough is the point: the map says "this side of town", not "this house".

import { query } from "@effy/edge-shared";
import type { RunMapDTO, RunMapPoint, RunMapStop } from "@effy/shared-types";

import type { StopRow } from "./repository";

const PLACES = `
  SELECT k.i::int AS i, p.lat, p.lng
    FROM unnest($1::text[], $2::text[]) WITH ORDINALITY AS k(postcode, suburb, i)
    LEFT JOIN LATERAL (
      SELECT l.latitude::float8 AS lat, l.longitude::float8 AS lng
        FROM public.locality l
       WHERE l.postcode = k.postcode AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL
       ORDER BY (lower(l.name) = lower(coalesce(k.suburb, ''))) DESC, l.address_count DESC, l.name
       LIMIT 1
    ) p ON TRUE
`;

const HUB = `SELECT hub_latitude::float8 AS lat, hub_longitude::float8 AS lng FROM public.delivery_settings WHERE id = 1`;

/** The hub's point; null when the hub is not set. */
export async function hubPoint(): Promise<RunMapPoint | null> {
  const r = (await query<{ lat: number | null; lng: number | null }>(HUB)).rows[0];
  return r && r.lat !== null && r.lng !== null ? { lat: Number(r.lat), lng: Number(r.lng) } : null;
}

/**
 * The map of a round whose stops are [stops], ALREADY IN DISPLAY ORDER (the run list's order, so a
 * pin's number matches its row). A delivery run starts at the hub; a collection run ends there (its
 * hub check-in stop). [allDone] draws a finished run (History). Null when fewer than two points are
 * known — a map of one pin says nothing.
 */
export async function runMapOf(stops: StopRow[], kind: "collection" | "delivery", allDone = false): Promise<RunMapDTO | null> {
  const hub = await hubPoint();
  const places = stops.filter((s) => s.stop_kind !== "hub_checkin");
  const postcodes = places.map((s) => (s.stop_kind === "shop_pickup" ? s.postcode : s.destination_postcode) ?? "");
  const suburbs = places.map((s) => (s.stop_kind === "shop_pickup" ? s.suburb : s.destination_suburb) ?? "");
  const found = places.length
    ? (await query<{ i: number; lat: number | null; lng: number | null }>(PLACES, [postcodes, suburbs])).rows
    : [];
  const pointOf = new Map<string, RunMapPoint>();
  for (const r of found) {
    if (r.lat !== null && r.lng !== null) pointOf.set(places[r.i - 1]!.stop_id, { lat: Number(r.lat), lng: Number(r.lng) });
  }

  const finished = (s: StopRow) => allDone || s.stop_status === "done" || s.stop_status === "skipped";
  const nextId = stops.find((s) => !finished(s))?.stop_id ?? null;
  const out: RunMapStop[] = [];
  if (kind === "delivery" && hub) out.push({ n: null, kind: "hub", status: "done", point: hub });
  let n = 0;
  for (const s of stops) {
    const status: RunMapStop["status"] = finished(s) ? "done" : s.stop_id === nextId ? "next" : "todo";
    if (s.stop_kind === "hub_checkin") {
      if (hub) out.push({ n: null, kind: "hub", status, point: hub });
      continue;
    }
    n += 1;
    const point = pointOf.get(s.stop_id);
    if (point) out.push({ n, kind: s.stop_kind === "shop_pickup" ? "shop" : "customer", status, point });
  }
  if (out.length < 2) return null;
  return { stops: out, hub };
}
