// 096 US5 — the hub station (FR-042, FR-043): hub staff check bags in with a handheld scanner as they
// come off a collection run. The SAME rules as the driver's check-in (research R8): the bags a run
// still owes are `bagsToCheckIn`, each is recorded through the one hand-over writer (actor: hub staff),
// and the scan of a run's last bag closes it through `closeRunCheckin` — the driver's own close.
//
// ⚠ Every read is recorded, accepted or refused, through the one read writer.
import { withTransaction } from "@effy/edge-shared";
import { bagsToCheckIn, closeRunCheckin, hubSortOf } from "@effy/edge-shared/delivery";
import { recordHandovers, recordReads, resolveCode } from "@effy/edge-shared/labels";
import {
  READ_OUTCOME_WORDS,
  readCode,
  type HubCheckinResultDTO,
  type HubExpectedDTO,
  type HubSortDTO,
  type LabelReadDTO,
  type ReadMethod,
  type ReadOutcome,
} from "@effy/shared-types";

import * as repo from "./repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sortOf = (f: { delivered_by: "effy" | "courier"; window_start: Date | null; window_end: Date | null; any_time: boolean }, at: Date): HubSortDTO =>
  hubSortOf({ deliveredBy: f.delivered_by, windowStart: f.window_start, windowEnd: f.window_end, anyTime: f.any_time }, at);

/** The runs on their way in, each with its bags and where each goes. */
export async function expected(): Promise<HubExpectedDTO> {
  return withTransaction(async (tx) => {
    const rows = await repo.expectedBags(tx);
    const at = new Date();
    const runs = new Map<string, HubExpectedDTO["runs"][number]>();
    for (const r of rows) {
      const run = runs.get(r.run_id) ?? { runId: r.run_id, driverName: r.driver_name, bags: [] };
      run.bags.push({
        parcelId: r.parcel_id, code: r.parcel_code, seq: Number(r.seq), of: Number(r.of), zone: r.zone,
        orderNumber: r.order_number, checkedIn: r.checked_in, sort: sortOf(r, at),
      });
      runs.set(r.run_id, run);
    }
    return { runs: [...runs.values()] };
  });
}

export interface CheckinOutcome {
  results: HubCheckinResultDTO[];
  /** Drivers whose runs moved, for the live announcement after commit. */
  drivers: string[];
  /** Shops whose bags arrived (their consoles show "At hub"). */
  shops: string[];
}

/** Judge and record each read; check in each accepted bag; close every run this completes. */
export async function checkIn(sub: string, reads: ReadonlyArray<Partial<LabelReadDTO>>): Promise<CheckinOutcome> {
  return withTransaction(async (tx) => {
    const results: HubCheckinResultDTO[] = [];
    const drivers = new Set<string>();
    const shops = new Set<string>();
    const at = new Date();
    const seen = new Set<string>();
    for (const read of reads) {
      if (typeof read?.clientReadId !== "string" || !UUID.test(read.clientReadId) || seen.has(read.clientReadId)) continue;
      if (typeof read.raw !== "string" || read.raw.trim() === "") continue;
      seen.add(read.clientReadId);
      const method: ReadMethod = read.method === "typed" ? "typed" : "scan";
      const result = await judgeAndCheckIn(tx, sub, read, method, at);
      if (result.driverId) drivers.add(result.driverId);
      if (result.shopId) shops.add(result.shopId);
      results.push(result.dto);
      await recordReads(tx, {
        actor: { kind: "admin_staff", sub },
        surface: "back_office",
        step: "checkin",
        roundId: result.runId,
        reads: [{ ...read, method, outcome: result.dto.outcome }],
        judge: () => result.dto.outcome,
      });
    }
    return { results, drivers: [...drivers], shops: [...shops] };
  });
}

async function judgeAndCheckIn(
  tx: { query: (t: string, v?: unknown[]) => Promise<any> },
  sub: string,
  read: Partial<LabelReadDTO>,
  method: ReadMethod,
  at: Date,
): Promise<{ dto: HubCheckinResultDTO; runId: string | null; driverId: string | null; shopId?: string }> {
  const raw = (read.raw ?? "").trim().slice(0, 64);
  const refuse = (outcome: ReadOutcome, code: string | null, runId: string | null = null) =>
    ({ dto: { clientReadId: read.clientReadId!, outcome, words: READ_OUTCOME_WORDS[outcome], code, runClosed: false }, runId, driverId: null });

  const code = readCode(raw, method);
  if (!code) return refuse("not_a_label", null);
  const bag = await resolveCode(tx, raw);
  if (!bag || bag.kind !== "parcel") return refuse("not_found", code);
  if (bag.voided) return refuse("voided", bag.code);
  if (bag.cancelled) return refuse("cancelled", bag.code);

  const run = await repo.openRunFor(tx, bag.packageId);
  if (!run) return refuse((await repo.everCheckedIn(tx, bag.parcelId)) ? "already_counted" : "not_on_this_work", bag.code);

  const owed = await bagsToCheckIn(tx, run.runId);
  if (!owed.some((p) => p.parcelId === bag.parcelId)) {
    return refuse((await repo.everCheckedIn(tx, bag.parcelId)) ? "already_counted" : "not_on_this_work", bag.code, run.runId);
  }

  await recordHandovers(tx, {
    step: "checkin",
    actor: { kind: "admin_staff", sub },
    roundId: run.runId,
    changeId: crypto.randomUUID(),
    parcels: [{ parcelId: bag.parcelId, method }],
    allowed: new Map([[bag.parcelId, bag.packageId]]),
    deviceAt: read.deviceAt ?? null,
  });

  // The run's last bag closes it — the driver's own close, recorded as hub staff's.
  let runClosed = false;
  if (owed.length === 1 && !(await repo.runHasUnsettledStops(tx, run.runId))) {
    await closeRunCheckin(tx, run.runId, { by: "admin_staff", sub });
    runClosed = true;
  }

  const facts = await repo.sortFacts(tx, bag.packageId);
  return {
    dto: {
      clientReadId: read.clientReadId!,
      outcome: "accepted",
      words: facts.of > 1 ? `Bag ${bag.seq} of ${facts.of}` : READ_OUTCOME_WORDS.accepted,
      code: bag.code,
      sort: sortOf(facts, at),
      orderNumber: facts.order_number,
      zone: bag.zone as HubCheckinResultDTO["zone"],
      runClosed,
    },
    runId: run.runId,
    driverId: run.driverId,
    shopId: bag.shopId,
  };
}
