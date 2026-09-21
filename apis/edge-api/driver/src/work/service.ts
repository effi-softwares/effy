// The driver's own work — service layer (063).
//
// Maps the new round/stop/package model into the 049 wire contract the app is already built against
// (see ./sql.ts for the vocabulary table). The app changes nothing to read this.

import { orderRoundStops } from "@effy/edge-shared";
import type {
  CollectionStopDTO,
  CollectionStopSummary,
  DeliveryDropSummary,
  DeliveryRunDTO,
  DriverCollectionRunDTO,
  DriverPhase,
  TodayDTO,
  TodayItemRef,
} from "@effy/shared-types";

import {
  addressLine,
  completedToday,
  currentRound,
  ownsRound,
  packageItems,
  roundPackages,
  roundStops,
  type PackageRow,
  type StopRow,
} from "./repository";

/** Raised when a driver asks for work that is not theirs, or does not exist. Both, identically. */
export class NotFoundError extends Error {
  constructor() {
    super("not_found");
    this.name = "NotFoundError";
  }
}

/** The contract's stop status vocabulary, from the model's. */
function stopStatus(s: StopRow["stop_status"], anyShort: boolean): CollectionStopSummary["status"] {
  if (s === "done") return anyShort ? "short" : "collected";
  if (s === "arrived") return "en_route";
  return "assigned";
}

/**
 * Order a round's stops for display.
 *
 * ⚠ THE RULE IS IMPORTED, NOT WRITTEN HERE (research R5). The dispatcher console orders the same
 * round with the same function; if this service sorted its own way, a dispatcher's reorder would
 * silently never reach the driver and NOTHING would fail — both surfaces would keep rendering
 * something. NP8 re-implements it locally to prove the guard catches it.
 */
function ordered(stops: StopRow[]): StopRow[] {
  const keyed = stops.map((s) => ({
    id: s.stop_id,
    seq: s.seq,
    status: s.stop_status,
    dueAt: null,
    zoneId: s.zone_id,
    shopId: s.shop_id,
    row: s,
  }));
  return orderRoundStops(keyed).map((k) => k.row);
}

function packagesByStop(rows: PackageRow[]): Map<string, PackageRow[]> {
  const m = new Map<string, PackageRow[]>();
  for (const r of rows) {
    const list = m.get(r.stop_id);
    if (list) list.push(r);
    else m.set(r.stop_id, [r]);
  }
  return m;
}

/** GET /driver/v1/today — what to do next, already ordered (FR-017, FR-036). */
export async function today(driverId: string): Promise<TodayDTO> {
  const round = await currentRound(driverId);

  if (round === null) {
    // ⚠ An ordinary answer, not an error: an on-duty driver with nothing assigned yet. The app must
    // be able to tell it from a failed request, or "no work" and "we could not ask" look identical.
    return { phase: "idle", activeRunId: null, active: null, upNext: [], remainingCount: 0 };
  }

  const [stops, packages] = await Promise.all([
    roundStops(round.id, driverId),
    roundPackages(round.id, driverId),
  ]);
  const byStop = packagesByStop(packages);
  const sorted = ordered(stops);
  const outstanding = sorted.filter((s) => s.stop_status === "pending" || s.stop_status === "arrived");

  const phase: DriverPhase = round.kind === "collection" ? "collection" : "same_day_delivery";

  const toRef = (s: StopRow): TodayItemRef => ({
    kind: round.kind === "collection" ? "collection_stop" : "delivery_drop",
    id: s.stop_id,
    runId: round.id,
    // ⚠ No address detail and no money on the home screen — the contract says so and 049 FR-013
    // keeps currency out of the driver domain entirely.
    title: round.kind === "collection" ? (s.shop_name ?? "Shop") : (s.destination_suburb ?? "Delivery"),
    subtitle: (byStop.get(s.stop_id)?.length ?? 0) > 0 ? `${byStop.get(s.stop_id)!.length} packages` : null,
    status: s.stop_status,
  });

  return {
    phase,
    activeRunId: round.id,
    active: outstanding.length > 0 ? toRef(outstanding[0]!) : null,
    upNext: outstanding.slice(1).map(toRef),
    remainingCount: outstanding.length,
  };
}

/** GET /driver/v1/collection/runs/{runId} */
export async function collectionRun(runId: string, driverId: string): Promise<DriverCollectionRunDTO> {
  if (!(await ownsRound(runId, driverId))) throw new NotFoundError();

  const [stops, packages] = await Promise.all([roundStops(runId, driverId), roundPackages(runId, driverId)]);
  const byStop = packagesByStop(packages);

  return {
    runId,
    status: "assigned",
    stops: ordered(stops).map((s, i) => {
      const pkgs = byStop.get(s.stop_id) ?? [];
      return {
        stopId: s.stop_id,
        // ⚠ The DISPLAY position, derived from the shared ordering — not `seq`, which is only set
        // when a dispatcher has reordered. Two orderings, one answer (R5).
        sequence: i + 1,
        shopName: s.shop_name ?? "",
        shopCode: s.shop_code ?? "",
        address: addressLine([s.address_line1, s.address_line2, s.suburb, s.state, s.postcode]),
        packageCount: pkgs.length,
        status: stopStatus(s.stop_status, pkgs.some((p) => p.state === "not_available")),
      } satisfies CollectionStopSummary;
    }),
  };
}

/** GET /driver/v1/collection/runs/{runId}/stops/{stopId} — the manifest for one shop. */
export async function collectionStop(
  runId: string,
  stopId: string,
  driverId: string,
): Promise<CollectionStopDTO> {
  if (!(await ownsRound(runId, driverId))) throw new NotFoundError();

  const stops = await roundStops(runId, driverId);
  const stop = stops.find((s) => s.stop_id === stopId);
  if (!stop) throw new NotFoundError();

  const pkgs = (await roundPackages(runId, driverId)).filter((p) => p.stop_id === stopId);
  const items = await packageItems(pkgs.map((p) => p.package_id));

  return {
    stopId,
    shopName: stop.shop_name ?? "",
    shopCode: stop.shop_code ?? "",
    address: addressLine([stop.address_line1, stop.address_line2, stop.suburb, stop.state, stop.postcode]),
    status: stopStatus(stop.stop_status, pkgs.some((p) => p.state === "not_available")),
    packages: pkgs.map((p) => ({
      ref: p.order_number,
      destinationSuburb: p.destination_suburb ?? "",
      method: p.method,
      // The manifest is per shop, so every line of every package at this stop is listed together —
      // which is what a picker at a counter actually reads from.
      items: items.map((i) => ({ name: i.name, qty: Number(i.qty) })),
    })),
  };
}

/** GET /driver/v1/delivery/runs/{runId} */
export async function deliveryRun(runId: string, driverId: string): Promise<DeliveryRunDTO> {
  if (!(await ownsRound(runId, driverId))) throw new NotFoundError();

  const [stops, packages] = await Promise.all([roundStops(runId, driverId), roundPackages(runId, driverId)]);
  const byStop = packagesByStop(packages);

  return {
    runId,
    status: "assigned",
    drops: ordered(stops).map((s, i) => {
      const pkgs = byStop.get(s.stop_id) ?? [];
      return {
        dropId: s.stop_id,
        sequence: i + 1,
        orderRef: pkgs[0]?.order_number ?? "",
        customerSuburb: s.destination_suburb ?? "",
        packageCount: pkgs.length,
        // ⚠ null, always. The platform's delivery promise is DATE-granular (052 R4) — there is no
        // time window and none can be derived, and inventing one would put a promise on the one
        // screen a driver reads as instructions.
        window: null,
        // ⚠ The contract's vocabulary, not the model's. A drop that has not been started is
        // `staged` here — there is no "assigned", because to a driver a package sitting at the hub
        // is staged, not allocated. Mapping the model's word through would have typechecked only
        // because I widened the contract to accept it.
        status: s.stop_status === "done" ? "delivered" : s.stop_status === "arrived" ? "en_route" : "staged",
      } satisfies DeliveryDropSummary;
    }),
  };
}

/** Rounds finished today — read-only. */
export async function history(driverId: string): Promise<Array<{ id: string; kind: string; status: string }>> {
  return (await completedToday(driverId)).map((r) => ({ id: r.id, kind: r.kind, status: r.status }));
}
