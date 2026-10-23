// Maps the round/stop/package model into the driver wire contract (see./sql.ts for the vocabulary).

import { ANY_TIME_LABEL, anyTimeDayLabel, formatArrival, formatDeliveryWindow, formatMoment, melbourneDate, type DeliveryWindow } from "@effy/shared-types";
import { orderRoundStops, query, type Queryable } from "@effy/edge-shared";
import { readRoundStage, toReturnOnRound } from "@effy/edge-shared/delivery";
import { liveParcelsByPackage } from "@effy/edge-shared/labels";

import { dropStatusOf } from "./drop-status";
import { hubSortOf } from "@effy/edge-shared/delivery";
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

import { runMapOf } from "./run-map";
import {
  addressLine,
  stopOutcomes,
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

/** Not theirs and does not exist, identically. */
export class NotFoundError extends Error {
  constructor() {
    super("not_found");
    this.name = "NotFoundError";
  }
}

function stopStatus(s: StopRow["stop_status"], anyShort: boolean): CollectionStopSummary["status"] {
  if (s === "done") return anyShort ? "short" : "collected";
  if (s === "arrived") return "en_route";
  return "assigned";
}

/** The shared ordering rule, so a dispatcher's reorder reaches the driver. */
export function ordered(stops: StopRow[]): StopRow[] {
  const keyed = stops.map((s) => ({
    id: s.stop_id,
    seq: s.seq,
    status: s.stop_status,
    // A drop is due when its window opens, so earlier windows come first.
    dueAt: s.window_start,
    zoneId: s.zone_id,
    shopId: s.shop_id,
    row: s,
  }));
  return orderRoundStops(keyed).map((k) => k.row);
}

/** The label the list shows and the instants the app judges Due and Late by. */
function windowOf(s: StopRow): { window: string | null; deliveryWindow: DeliveryWindow | null } {
  if (!s.window_start || !s.window_end) return { window: null, deliveryWindow: null };
  const deliveryWindow = { startAt: s.window_start.toISOString(), endAt: s.window_end.toISOString() };
  // A day with no time: "Any time", with the round's hours.
  const hours = formatDeliveryWindow(deliveryWindow);
  return { window: s.any_time ? `${ANY_TIME_LABEL} · ${hours}` : hours, deliveryWindow };
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

/** What to do next, already ordered. */
export async function today(driverId: string): Promise<TodayDTO> {
  // A driver holds several rounds: the query's order picks the current one (under way, then open by
  // deadline, then soonest to open); the rest are `upcoming`.
  const [round, ...later] = await openRounds(driverId);

  if (round === undefined) {
    // An ordinary answer: nothing assigned yet, distinguishable from a failed request.
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
    kind: r.kind,
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
  // Which packages hold cold goods, for the Today card.
  const allIds = packages.map((p) => p.package_id);
  const manifests = manifestsByPackage(allIds, await packageItems(allIds));
  const coldOf = (stopId: string) =>
    (byStop.get(stopId) ?? []).filter((p) => {
      const sm = manifests.get(p.package_id)?.summary;
      return !!sm && (sm.frozen > 0 || sm.chilled > 0);
    }).length;

  // `outstanding` keeps work still to be done; the hub stop keeps a collection round non-empty until
  // its load is checked in. It names the finished states, so any in-progress state stays visible.
  const outstanding = sorted.filter((s) => s.stop_status !== "done" && s.stop_status !== "skipped");

  // What the driver is holding.
  const totalPackages = packages.filter((p) => p.state === "picked_up").length;

  const phase: DriverPhase = round.kind;

  const toRef = (s: StopRow): TodayItemRef => {
    // The hub stop has no shop to borrow a title from.
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
      // No address detail and no money on the home screen.
      title: round.kind === "collection" ? (s.shop_name ?? "Shop") : (s.destination_suburb ?? "Delivery"),
      subtitle: (byStop.get(s.stop_id)?.length ?? 0) > 0 ? `${byStop.get(s.stop_id)!.length} packages` : null,
      status: s.stop_status,
      street: round.kind === "collection" ? null : (s.destination_line1?.trim() || null),
      place: round.kind === "collection"
        ? addressLine([s.address_line1, s.address_line2, s.suburb, s.state, s.postcode])
        : [s.destination_suburb, s.destination_state, s.destination_postcode].filter((x) => x && x.trim()).join(" ") || null,
      packageCount: byStop.get(s.stop_id)?.length ?? 0,
      coldCount: coldOf(s.stop_id),
      ...(round.kind === "collection" ? {} : windowOf(s)),
      handover: s.handover ?? null,
    };
  };

  // Progress: shops and packages for a collection, drops for a delivery.
  const places = sorted.filter((s) => s.stop_kind !== "hub_checkin");
  const settled = (s: StopRow) => s.stop_status === "done" || s.stop_status === "skipped";
  const progress: TodayDTO["progress"] = round.kind === "collection"
    ? {
        done: places.filter(settled).length,
        total: places.length,
        packagesInVan: packages.filter((p) => p.state === "picked_up").length,
        packagesToLoad: places.filter((s) => !settled(s)).reduce((a, s) => a + (byStop.get(s.stop_id)?.length ?? 0), 0),
      }
    : {
        done: places.filter(settled).length,
        total: places.length,
        delivered: places.filter((s) => s.stop_status === "done").length,
        notDelivered: places.filter((s) => s.stop_status === "skipped").length,
      };

  // Failed parcels still in the van. When they are all that is left, `active` is null and the app shows "Return to hub".
  const toReturn = round.kind === "delivery" ? forWire(await toReturnOnRound(db, round.id)) : null;

  // An unloaded delivery round has one next step, loading: `active` is null and `loadStep` says what goes in.
  const stage = await readRoundStage(db, round.id);
  const staged = round.kind === "delivery" ? outstanding.filter((s) => s.stop_status === "pending") : [];
  const loadStep = stage?.stage === "to_load" && staged.length > 0
    ? { runId: round.id, dropCount: staged.length, packageCount: staged.reduce((a, s) => a + (byStop.get(s.stop_id)?.length ?? 0), 0) }
    : null;

  return {
    phase,
    activeRunId: round.id,
    active: loadStep === null && outstanding.length > 0 ? toRef(outstanding[0]!) : null,
    upNext: (loadStep === null ? outstanding.slice(1) : outstanding).map(toRef),
    stage: stage?.stage ?? null,
    stageLabel: stage?.label ?? null,
    loadStep,
    remainingCount: outstanding.length,
    // Null means open; while set, every action is refused (`assertRoundOpen`).
    opening: openingOf(round.opens_at, now),
    deadlineAt: round.deadline_at.toISOString(),
    dueLabel: formatMoment(round.deadline_at, now),
    upcoming,
    toReturn,
    changedNote: round.changed_note?.trim() || null,
    progress,
    map: await runMapOf(sorted, round.kind === "collection" ? "collection" : "delivery"),
  };
}

const db: Queryable = { query: (text, values) => query(text, values) };

/** Never the package ids the server keeps. */
function forWire<T extends { packageIds: string[] }>(t: T | null): Omit<T, "packageIds"> | null {
  if (t === null) return null;
  const { packageIds: _ids, ...rest } = t;
  return rest;
}

export async function collectionRun(runId: string, driverId: string): Promise<DriverCollectionRunDTO> {
  // Readable before the round opens: reading is the point of assigning early.
  const times = await roundTimes(runId, driverId);
  if (times === null) throw new NotFoundError();

  const [allStops, packages] = await Promise.all([roundStops(runId, driverId), roundPackages(runId, driverId)]);
  const byStop = packagesByStop(packages);
  // Every package's live bags, so the app can match bags offline.
  const bags = await liveParcelsByPackage(db, packages.map((p) => p.package_id));

  // The hub stop is excluded: it has no shop name, code or address and would render as a blank row.
  // `todayView` surfaces it instead.
  const stops = allStops.filter((s) => s.stop_kind !== "hub_checkin");

  const stage = await readRoundStage(db, runId);
  return {
    map: await runMapOf(ordered(allStops), "collection"),
    runId,
    status: "assigned",
    stage: stage?.stage ?? null,
    stageLabel: stage?.label ?? null,
    // Where each package goes at the hub, for the offline hub scan. A package left at its shop has none.
    hubSort: packages
      .filter((p) => p.state !== "not_available")
      .map((p) => ({
        packageCode: p.package_code,
        parcelCodes: (bags.get(p.package_id) ?? []).map((b) => b.code),
        ...hubSortOf(
          { deliveredBy: p.delivered_by, windowStart: p.window_start, windowEnd: p.window_end, anyTime: p.any_time },
          new Date(),
        ),
      })),
    opening: times.opening,
    deadlineAt: times.deadlineAt,
    dueLabel: times.dueLabel,
    stops: ordered(stops).map((s, i) => {
      const pkgs = byStop.get(s.stop_id) ?? [];
      return {
        stopId: s.stop_id,
        // The display position from the shared ordering, not `seq` (set only after a dispatcher reorder).
        sequence: i + 1,
        shopName: s.shop_name ?? "",
        shopCode: s.shop_code ?? "",
        address: addressLine([s.address_line1, s.address_line2, s.suburb, s.state, s.postcode]),
        packageCount: pkgs.length,
        parcels: pkgs.flatMap((p) => bags.get(p.package_id) ?? []),
        status: stopStatus(s.stop_status, pkgs.some((p) => p.state === "not_available")),
      } satisfies CollectionStopSummary;
    }),
  };
}

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
  const [manifests, bags] = await Promise.all([
    packageItems(packageIds).then((items) => manifestsByPackage(packageIds, items)),
    liveParcelsByPackage(db, packageIds),
  ]);

  return {
    stopId,
    shopName: stop.shop_name ?? "",
    shopCode: stop.shop_code ?? "",
    address: addressLine([stop.address_line1, stop.address_line2, stop.suburb, stop.state, stop.postcode]),
    status: stopStatus(stop.stop_status, pkgs.some((p) => p.state === "not_available")),
    opening: times.opening,
    packages: pkgs.map((p) => {
      // Each package's own lines.
      const manifest = manifests.get(p.package_id);
      return {
        packageId: p.package_id,
        packageCode: p.package_code,
        parcels: bags.get(p.package_id) ?? [],
        ref: p.order_number,
        destinationSuburb: p.destination_suburb ?? "",
        // Who takes it from the hub, and for Effy the day and window.
        deliveredBy: p.delivered_by,
        windowLabel: p.delivered_by === "effy" && p.window_start && p.window_end
          ? p.any_time
            ? anyTimeDayLabel(melbourneDate(p.window_start), new Date())
            : formatArrival({ promisedFrom: null, promisedTo: null, windowStart: p.window_start.toISOString(), windowEnd: p.window_end.toISOString() }, new Date())
          : null,
        items: manifest?.items ?? [],
        summary: manifest?.summary ?? { ...EMPTY_SUMMARY },
      };
    }),
  };
}

export async function deliveryRun(runId: string, driverId: string): Promise<DeliveryRunDTO> {
  const times = await roundTimes(runId, driverId);
  if (times === null) throw new NotFoundError();

  const [stops, packages] = await Promise.all([roundStops(runId, driverId), roundPackages(runId, driverId)]);
  const byStop = packagesByStop(packages);
  // One items read for the whole run, not one per drop.
  const allIds = packages.map((p) => p.package_id);
  const [manifests, outcomes, bags] = await Promise.all([
    packageItems(allIds).then((items) => manifestsByPackage(allIds, items)),
    stopOutcomes(runId),
    liveParcelsByPackage(db, allIds),
  ]);
  const sorted = ordered(stops);

  const stage = await readRoundStage(db, runId);
  return {
    map: await runMapOf(sorted, "delivery"),
    runId,
    status: "assigned",
    stage: stage?.stage ?? null,
    stageLabel: stage?.label ?? null,
    // Parcels from failed drops, still to be returned.
    toReturn: forWire(await toReturnOnRound(db, runId)),
    opening: times.opening,
    deadlineAt: times.deadlineAt,
    dueLabel: times.dueLabel,
    drops: sorted.map((s, i) => {
      const pkgs = byStop.get(s.stop_id) ?? [];
      const outcome = outcomes.get(s.stop_id);
      return {
        dropId: s.stop_id,
        sequence: i + 1,
        orderRef: pkgs[0]?.order_number ?? "",
        customerSuburb: s.destination_suburb ?? "",
        packageCount: pkgs.length,
        parcels: pkgs.flatMap((p) => bags.get(p.package_id) ?? []),
        // The window the customer was sold, read from the order, never derived.
        ...windowOf(s),
        // The contract's vocabulary: an unstarted drop is `staged`. One mapping for every drop read.
        status: dropStatusOf(s.stop_status),
        summary: addSummaries(pkgs.map((p) => manifests.get(p.package_id)?.summary ?? EMPTY_SUMMARY)),
        // The street, and how a finished drop ended.
        street: s.destination_line1?.trim() || null,
        completedAt: s.completed_at ? s.completed_at.toISOString() : null,
        proofMethod: s.stop_status === "done" ? ((outcome?.method as DeliveryDropSummary["proofMethod"]) ?? null) : null,
        failureReason: s.stop_status === "skipped" ? ((outcome?.reason as DeliveryDropSummary["failureReason"]) ?? null) : null,
      } satisfies DeliveryDropSummary;
    }),
  };
}

export async function history(driverId: string): Promise<Array<{ id: string; kind: string; status: string }>> {
  return (await completedToday(driverId)).map((r) => ({ id: r.id, kind: r.kind, status: r.status }));
}
