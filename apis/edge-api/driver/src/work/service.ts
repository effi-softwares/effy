// The driver's own work — service layer (063).
//
// Maps the new round/stop/package model into the 049 wire contract the app is already built against
// (see ./sql.ts for the vocabulary table). The app changes nothing to read this.

import { formatDeliveryWindow, formatMoment, type DeliveryWindow } from "@effy/shared-types";
import { orderRoundStops } from "@effy/edge-shared";

import { dropStatusOf } from "./drop-status";
import { EMPTY_SUMMARY, addSummaries, manifestsByPackage } from "./manifest";
import type {
  CollectionStopDTO,
  CollectionStopSummary,
  DeliveryDropSummary,
  DeliveryRunDTO,
  DriverCollectionRunDTO,
  DriverPhase,
  TodayDTO,
  TodayItemRef,
  UpcomingRound,
} from "@effy/shared-types";

import {
  addressLine,
  completedToday,
  openingOf,
  openRounds,
  packageItems,
  roundPackages,
  roundStops,
  roundTimes,
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
    // 069 — a drop is due when its window opens, so earlier windows come first (FR-031). ⚠ The rule
    // that USES this is still the shared one; this only stops handing it null. Until 069 no stop had
    // a time to be ordered by, because no window was ever sold.
    dueAt: s.window_start,
    zoneId: s.zone_id,
    shopId: s.shop_id,
    row: s,
  }));
  return orderRoundStops(keyed).map((k) => k.row);
}

/** A drop's window, as the label the list shows and the instants the app judges Due and Late by. */
function windowOf(s: StopRow): { window: string | null; deliveryWindow: DeliveryWindow | null } {
  if (!s.window_start || !s.window_end) return { window: null, deliveryWindow: null };
  const deliveryWindow = { startAt: s.window_start.toISOString(), endAt: s.window_end.toISOString() };
  return { window: formatDeliveryWindow(deliveryWindow), deliveryWindow };
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
  // 072 — a driver now holds several rounds at once: work is assigned the moment they can take it,
  // hours before it opens. The query's ORDER is the rule for which one is current (under way, then
  // open by deadline, then soonest to open); everything after the first is `upcoming`.
  const [round, ...later] = await openRounds(driverId);

  if (round === undefined) {
    // ⚠ An ordinary answer, not an error: an on-duty driver with nothing assigned yet. The app must
    // be able to tell it from a failed request, or "no work" and "we could not ask" look identical.
    return {
      phase: "idle",
      activeRunId: null,
      active: null,
      upNext: [],
      remainingCount: 0,
      opening: null,
      deadlineAt: null,
      dueLabel: null,
      upcoming: [],
    };
  }

  const now = new Date();
  const upcoming: UpcomingRound[] = later.map((r) => ({
    runId: r.id,
    kind: r.kind === "collection" ? "collection" : "same_day_delivery",
    opening: openingOf(r.opens_at, now),
    deadlineAt: r.deadline_at.toISOString(),
    dueLabel: formatMoment(r.deadline_at, now),
    stopCount: r.stop_count,
    packageCount: r.package_count,
  }));

  const [stops, packages] = await Promise.all([
    roundStops(round.id, driverId),
    roundPackages(round.id, driverId),
  ]);
  const byStop = packagesByStop(packages);
  const sorted = ordered(stops);

  // ⚠ 064 — `outstanding` IS WHY THE HUB HAD TO BECOME A STOP. It keeps only work still to be done,
  // which is correct; the defect was that a collection round had nothing left in it once the last
  // shop was collected, while the load was still in the van. The hub stop is what fills that gap, so
  // `active`, `upNext` and `remainingCount` all keep describing reality until the load is checked in.
  // ⚠ NAMES THE FINISHED STATES, NOT THE OPEN ONES (2026-09-30). This listed `pending` and `arrived`,
  // so the moment a driver pressed "Start this drop" the drop would have left the Today screen
  // entirely — the same shape as the hub-stop defect, by a different road. Testing for what is DONE
  // means a future in-progress state stays visible without anyone remembering to add it here.
  const outstanding = sorted.filter((s) => s.stop_status !== "done" && s.stop_status !== "skipped");

  // What the driver is physically holding — the hub row's subtitle, and the honest count.
  const totalPackages = packages.filter((p) => p.state === "picked_up").length;

  const phase: DriverPhase = round.kind === "collection" ? "collection" : "same_day_delivery";

  const toRef = (s: StopRow): TodayItemRef => {
    // ⚠ 064 — THE HUB IS A WORK ITEM NOW, and it needs its own title because it has no shop and no
    // destination to borrow one from. Before this it fell through to "Shop", which is what an
    // identity-less stop looks like when a default is doing the work a case should.
    if (s.stop_kind === "hub_checkin") {
      const held = totalPackages;
      return {
        kind: "hub_checkin",
        id: s.stop_id,
        runId: round.id,
        title: "Hub check-in",
        subtitle: held > 0 ? `${held} packages to check in` : null,
        status: s.stop_status,
      };
    }
    return {
      kind: round.kind === "collection" ? "collection_stop" : "delivery_drop",
      id: s.stop_id,
      runId: round.id,
      // ⚠ No address detail and no money on the home screen — the contract says so and 049 FR-013
      // keeps currency out of the driver domain entirely.
      title: round.kind === "collection" ? (s.shop_name ?? "Shop") : (s.destination_suburb ?? "Delivery"),
      subtitle: (byStop.get(s.stop_id)?.length ?? 0) > 0 ? `${byStop.get(s.stop_id)!.length} packages` : null,
      status: s.stop_status,
    };
  };

  return {
    phase,
    activeRunId: round.id,
    active: outstanding.length > 0 ? toRef(outstanding[0]!) : null,
    upNext: outstanding.slice(1).map(toRef),
    remainingCount: outstanding.length,
    // ⚠ Null means OPEN. The round is shown in full either way; while this is set, every action on
    // it is refused by the platform (`assertRoundOpen`), and the app says when it opens.
    opening: openingOf(round.opens_at, now),
    deadlineAt: round.deadline_at.toISOString(),
    dueLabel: formatMoment(round.deadline_at, now),
    upcoming,
  };
}

/** GET /driver/v1/collection/runs/{runId} */
export async function collectionRun(runId: string, driverId: string): Promise<DriverCollectionRunDTO> {
  // ⚠ Readable whether or not the round has opened (FR-020) — reading is the point of assigning early.
  const times = await roundTimes(runId, driverId);
  if (times === null) throw new NotFoundError();

  const [allStops, packages] = await Promise.all([roundStops(runId, driverId), roundPackages(runId, driverId)]);
  const byStop = packagesByStop(packages);

  // ⚠ THE HUB STOP IS EXCLUDED HERE, DELIBERATELY (064, research R11).
  //
  // This projection maps every stop onto `CollectionStopSummary`, which requires a shop name, a shop
  // code and an address. A `hub_checkin` stop carries NONE of them — `round_stop_target_ck` requires
  // its `shop_id` and `order_id` to be NULL — so including it would emit a stop whose identity is
  // three empty strings. That renders as a blank row a driver can tap, with no error in any log,
  // test or screen: the same "valid, compiles, renders as nothing" shape `check-token-usage.mjs`
  // exists to catch on the web.
  //
  // The hub is not hidden from the driver — it is surfaced by `todayView` below, as the round's
  // outstanding work, which is the thing that was missing.
  const stops = allStops.filter((s) => s.stop_kind !== "hub_checkin");

  return {
    runId,
    status: "assigned",
    opening: times.opening,
    deadlineAt: times.deadlineAt,
    dueLabel: times.dueLabel,
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
  const times = await roundTimes(runId, driverId);
  if (times === null) throw new NotFoundError();

  const stops = await roundStops(runId, driverId);
  const stop = stops.find((s) => s.stop_id === stopId);
  if (!stop) throw new NotFoundError();

  const pkgs = (await roundPackages(runId, driverId)).filter((p) => p.stop_id === stopId);
  const packageIds = pkgs.map((p) => p.package_id);
  const manifests = manifestsByPackage(packageIds, await packageItems(packageIds));

  return {
    stopId,
    shopName: stop.shop_name ?? "",
    shopCode: stop.shop_code ?? "",
    address: addressLine([stop.address_line1, stop.address_line2, stop.suburb, stop.state, stop.postcode]),
    status: stopStatus(stop.stop_status, pkgs.some((p) => p.state === "not_available")),
    opening: times.opening,
    packages: pkgs.map((p) => {
      // ⚠ Each package's OWN lines (065). This used to hand every package every line at the stop,
      // on the reasoning that "the manifest is per shop" — but the contract puts `items` on the
      // package and the app counts them per package, so three packages each claimed the stop's total.
      const manifest = manifests.get(p.package_id);
      return {
        ref: p.order_number,
        destinationSuburb: p.destination_suburb ?? "",
        method: p.method,
        items: manifest?.items ?? [],
        summary: manifest?.summary ?? { ...EMPTY_SUMMARY },
      };
    }),
  };
}

/** GET /driver/v1/delivery/runs/{runId} */
export async function deliveryRun(runId: string, driverId: string): Promise<DeliveryRunDTO> {
  const times = await roundTimes(runId, driverId);
  if (times === null) throw new NotFoundError();

  const [stops, packages] = await Promise.all([roundStops(runId, driverId), roundPackages(runId, driverId)]);
  const byStop = packagesByStop(packages);
  // ⚠ ONE items read for the whole run, not one per drop (065) — a round is a dozen drops and this
  // list is the screen a driver opens most.
  const allIds = packages.map((p) => p.package_id);
  const manifests = manifestsByPackage(allIds, await packageItems(allIds));

  return {
    runId,
    status: "assigned",
    opening: times.opening,
    deadlineAt: times.deadlineAt,
    dueLabel: times.dueLabel,
    drops: ordered(stops).map((s, i) => {
      const pkgs = byStop.get(s.stop_id) ?? [];
      return {
        dropId: s.stop_id,
        sequence: i + 1,
        orderRef: pkgs[0]?.order_number ?? "",
        customerSuburb: s.destination_suburb ?? "",
        packageCount: pkgs.length,
        // 069 — the window the CUSTOMER WAS SOLD, read from the order, never derived. ⚠ This read
        // `window: null` from 049 until 069, under a comment saying there was no window and that
        // inventing one would put a promise on the one screen a driver reads as instructions. That
        // was right, and still is: an order placed before 069 has none and still says nothing.
        ...windowOf(s),
        // ⚠ The contract's vocabulary, not the model's. A drop that has not been started is
        // `staged` here — there is no "assigned", because to a driver a package sitting at the hub
        // is staged, not allocated. Mapping the model's word through would have typechecked only
        // because I widened the contract to accept it.
        // ⚠ Was `arrived → "en_route"`, everything else → "staged": the run list disagreed with the drop
        // screen about the same drop. Both now read through one mapping.
        status: dropStatusOf(s.stop_status),
        summary: addSummaries(pkgs.map((p) => manifests.get(p.package_id)?.summary ?? EMPTY_SUMMARY)),
      } satisfies DeliveryDropSummary;
    }),
  };
}

/** Rounds finished today — read-only. */
export async function history(driverId: string): Promise<Array<{ id: string; kind: string; status: string }>> {
  return (await completedToday(driverId)).map((r) => ({ id: r.id, kind: r.kind, status: r.status }));
}
