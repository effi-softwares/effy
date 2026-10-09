// The dispatcher's overrides (063, US4).
//
// ⚠ A DISPATCHER MAY OVERRIDE A PREFERENCE. THEY MAY NOT OVERRIDE A FACT (FR-034). Reassigning to a
// driver the engine merely ranked lower is the whole point of this screen. Reassigning to one who is
// unlicensed, stood down, or holding no suitable vehicle is refused, naming the condition — those are
// not opinions the engine formed, they are things about the world.

import {
  eligibilityReasons,
  endOfLocalDay,
  nextRunInstant,
  query,
  withTransaction,
  type ExclusionReason,
  orderRoundStops,
} from "@effy/edge-shared";

import { nonDeliveryDates } from "@effy/edge-shared/delivery";

import { loadCandidates, loadSchedule } from "../planner/repository";
import { dueRun, isoDateOf } from "../planner/service";
import { recordAudit, type DispatchAuditAction } from "../shared/audit";
import {
  DAY_ROUNDS,
  ROUND_DETAIL_STOPS,
  ROUND_FOR_UPDATE,
  ROUND_WORK,
  UNASSIGNED_WORK,
} from "./sql";

export class DispatchError extends Error {
  constructor(
    readonly kind: "not_found" | "stale" | "ineligible" | "invalid",
    readonly detail: string,
    readonly reasons: ExclusionReason[] = [],
  ) {
    super(kind);
    this.name = "DispatchError";
  }
}

export async function readDay() {
  const [rounds, unassigned, schedule] = await Promise.all([
    query<any>(DAY_ROUNDS),
    // 082 — $1: the end of the local day. A hub parcel for a later day is waiting, not unassigned.
    query<any>(UNASSIGNED_WORK, [endOfLocalDay(new Date())]),
    loadSchedule(),
  ]);

  const now = Date.now();
  // 072 — what each unassigned package is waiting FOR. A shop-side package belongs to the next
  // collection run (the planner's own rule, `nextRunInstant`); a hub-side one to the end of its
  // delivery window, or the end of the day where it has none or has already missed it.
  const nextRun = nextRunInstant(schedule.runs, new Date(now));
  const endOfDay = endOfLocalDay(new Date(now));
  const targetOf = (u: { stage: string; window_end: Date | null }): string | null => {
    if (u.stage === "collection") return nextRun ? nextRun.toISOString() : null;
    const end = u.window_end && u.window_end.getTime() > now ? u.window_end : endOfDay;
    return end.toISOString();
  };
  // 082 — the planner's own rule for WHICH run a shop-side parcel travels on (`dueRun`). One not yet
  // due on the next run is waiting at its supplier on purpose and is left out; one whose run has gone
  // is listed and marked late.
  const calendar = {
    noWeekdays: schedule.settings.noDeliveryWeekdays,
    noDates: await nonDeliveryDates({ query: (t, v) => query(t, v) }, isoDateOf(new Date(now), -8)),
  };
  const dueOf = (u: { stage: string; delivered_by: "effy" | "courier"; window_start: Date | null }): Date | null =>
    u.stage === "collection" ? dueRun({ deliveredBy: u.delivered_by, windowStart: u.window_start }, schedule.runs, schedule.settings, calendar) : null;
  const listed = unassigned.rows.filter((u: any) => {
    const due = dueOf(u);
    return due === null || nextRun === null || due.getTime() <= nextRun.getTime();
  });
  return {
    rounds: rounds.rows.map((r) => ({
      round: {
        id: r.id,
        kind: r.kind,
        status: r.status,
        deadlineAt: r.deadline_at.toISOString(),
        // 072 — null means open. A past instant is open too; it is sent as it is so the console can
        // say "opened at" if it ever wants to, and judged against the clock there.
        opensAt: r.opens_at ? (r.opens_at as Date).toISOString() : null,
        changedNote: r.changed_note,
        stops: [],
      },
      driverId: r.driver_id,
      driverName: r.driver_name,
      stopsRemaining: Number(r.stops_remaining),
      packagesRemaining: Number(r.packages_remaining),
      // ⚠ Derived on read, never stored (027's counted-not-stored rule). A stored `isLate` would be
      // wrong every minute nothing wrote to it.
      isLate: r.status !== "completed" && r.status !== "cancelled" && r.deadline_at.getTime() < now,
    })),
    unassigned: listed.map((u: any) => ({
      packageId: u.package_id,
      orderNumber: u.order_number,
      shopName: u.shop_name,
      zoneName: u.zone_name,
      readySince: u.ready_since.toISOString(),
      collectLate: (() => {
        const due = dueOf(u);
        return due !== null && nextRun !== null && due.getTime() < nextRun.getTime();
      })(),
      // ⚠ An EMPTY array means no candidate existed at all — a staffing problem, not a fixable list.
      reasons: u.no_candidate ? [] : (u.reasons ?? []),
      stage: u.stage,
      targetAt: targetOf(u),
    })),
  };
}

export async function readRound(roundId: string) {
  const [round, stops] = await Promise.all([
    query<any>(ROUND_FOR_UPDATE.replace("FOR UPDATE", ""), [roundId]),
    query<any>(ROUND_DETAIL_STOPS, [roundId]),
  ]);
  const r = round.rows[0];
  if (!r) throw new DispatchError("not_found", "That round does not exist.");
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    driverId: r.driver_id,
    updatedAt: r.updated_at,
    deadlineAt: (r.deadline_at as Date).toISOString(),
    opensAt: r.opens_at ? (r.opens_at as Date).toISOString() : null,
    // ⚠ ORDERED BY THE SHARED RULE, the same one the driver's app is ordered by (research R5). This
    // read used to return the query's own `seq NULLS LAST, id` order, which agreed with the driver
    // only while no stop had a due time. 069 gives drops one — the window's start — so the two
    // would have diverged the first time a round carried two windows, and nothing would have failed.
    stops: orderRoundStops(
      stops.rows.map((s) => ({
        id: s.stop_id as string,
        seq: s.seq as number | null,
        status: s.status,
        dueAt: (s.window_start as Date | null) ?? null,
        zoneId: s.zone_id as string | null,
        shopId: s.shop_id as string | null,
        row: s,
      })),
    ).map(({ row: s }) => ({
      stopId: s.stop_id,
      seq: s.seq,
      kind: s.kind,
      status: s.status,
      zoneName: s.zone_name,
      label: s.shop_name ?? s.destination_suburb ?? "",
      orderNumber: s.order_number,
      // 069 — the window the customer was sold, as instants; the console says Due and Late from it.
      deliveryWindow:
        s.window_start && s.window_end
          ? { startAt: (s.window_start as Date).toISOString(), endAt: (s.window_end as Date).toISOString() }
          : null,
    })),
  };
}

/** Optimistic lock. ⚠ Compared at MICROSECOND precision — see ROUND_FOR_UPDATE's comment. */
function assertFresh(actual: string, expected: string) {
  if (actual !== expected) {
    throw new DispatchError("stale", "Somebody else changed this round. Reload and try again.");
  }
}

/**
 * Move a round to another driver (FR-029), refusing an ineligible one by name (FR-034).
 */
export async function reassign(
  roundId: string,
  toDriverId: string,
  expectedUpdatedAt: string,
  actorSub: string,
): Promise<void> {
  const candidates = await loadCandidates();
  const target = candidates.find((c) => c.driverId === toDriverId);
  if (!target) throw new DispatchError("not_found", "That driver does not exist.");

  await withTransaction(async (tx: any) => {
    const cur = await tx.query(ROUND_FOR_UPDATE, [roundId]);
    const r = cur.rows[0];
    if (!r) throw new DispatchError("not_found", "That round does not exist.");
    assertFresh(r.updated_at, expectedUpdatedAt);

    // ⚠ THE SAME RULE THE PLANNER USES, imported not retyped (063 R5) — AND, SINCE 072, ASKED ABOUT
    // THE ROUND AS IT REALLY IS (research R11). Until 072 this call hard-coded "no refrigeration",
    // an eight-hour deadline, twelve minutes a stop and the round's first zone, so a dispatcher
    // could do what the planner would not: put a chilled round in a van that cannot carry chilled.
    const work: {
      rows: Array<{
        zone_id: string | null;
        weight_grams: string;
        requires_chilled: boolean;
        requires_frozen: boolean;
        stops: number;
      }>;
    } = await tx.query(ROUND_WORK, [roundId]);
    const settings: { rows: Array<{ per_stop_allowance_min: number }> } = await tx.query(
      `SELECT per_stop_allowance_min FROM public.delivery_settings WHERE id = 1`,
    );
    const perStopAllowanceMin = settings.rows[0]?.per_stop_allowance_min ?? 12;

    const now = new Date();
    const deadlineAt = r.deadline_at as Date;
    const stops = Number(work.rows[0]?.stops ?? 0);
    // ⚠ A ROUND ALREADY LATE CAN STILL BE MOVED. The deadline gate would refuse every driver for a
    // round whose deadline has passed — and a late round is exactly the one a dispatcher most needs
    // to hand to somebody else. Its lateness is already shown; here only the driver's own shift end
    // limits it, so the deadline is set to when the remaining stops would finish.
    const late = deadlineAt.getTime() <= now.getTime();
    const effectiveDeadline = late ? new Date(now.getTime() + stops * perStopAllowanceMin * 60_000) : deadlineAt;
    // A round not yet begun cannot be worked before it opens (FR-005); one under way starts now.
    const startAt = r.status === "planned" && r.opens_at ? (r.opens_at as Date) : now;

    // One question per distinct area on the round — a driver must be cleared for ALL of it
    // — each carrying the whole round's weight, stops and refrigeration. An empty round still asks
    // the conditions that are about the driver and not the work.
    const units =
      work.rows.length > 0
        ? work.rows
        : [{ zone_id: null, weight_grams: "0", requires_chilled: false, requires_frozen: false, stops: 0 }];
    const found = new Set<ExclusionReason>();
    for (const u of units) {
      for (const reason of eligibilityReasons({
        driver: target,
        work: {
          function: r.kind,
          zoneId: u.zone_id,
          totalWeightGrams: Number(u.weight_grams),
          requiresChilled: u.requires_chilled,
          requiresFrozen: u.requires_frozen,
          stopCount: stops,
          deadlineAt: effectiveDeadline,
        },
        now,
        perStopAllowanceMin,
        startAt,
      })) {
        // An empty round has no zone to be cleared for; that one answer would be about nothing.
        if (work.rows.length === 0 && reason === "not_cleared") continue;
        found.add(reason);
      }
    }
    const reasons = [...found];

    if (reasons.length > 0) {
      throw new DispatchError(
        "ineligible",
        "That driver cannot take this round.",
        reasons,
      );
    }

    await tx.query(
      `UPDATE public.driver_round SET driver_id = $2, updated_at = now() WHERE id = $1`,
      [roundId, toDriverId],
    );
    await audit(tx, actorSub, "dispatch.reassign", roundId, { toDriverId });
  });
}

/** Take work back (FR-030) — it returns to the pool for the next wave, never disappears. */
export async function unassign(roundId: string, expectedUpdatedAt: string, actorSub: string): Promise<void> {
  await withTransaction(async (tx: any) => {
    const cur = await tx.query(ROUND_FOR_UPDATE, [roundId]);
    const r = cur.rows[0];
    if (!r) throw new DispatchError("not_found", "That round does not exist.");
    assertFresh(r.updated_at, expectedUpdatedAt);

    // ⚠ ONLY WORK STILL IN THE ROUND, NOT WORK ALREADY COLLECTED (FR-035). A `picked_up` package is
    // physically in a van and no query can know otherwise — 056's stranded-work finding. Releasing it
    // here would tell the planner to send a second driver for goods somebody already has.
    await tx.query(
      `DELETE FROM public.round_package rp
        USING public.round_stop rs
        WHERE rs.id = rp.stop_id AND rs.round_id = $1 AND rp.state = 'assigned'`,
      [roundId],
    );
    await tx.query(
      `UPDATE public.driver_round SET status = 'cancelled', updated_at = now() WHERE id = $1`,
      [roundId],
    );
    await audit(tx, actorSub, "dispatch.unassign", roundId, {});
  });
}

/** Set a dispatcher's own stop order (FR-031). */
export async function reorder(
  roundId: string,
  stopIds: string[],
  expectedUpdatedAt: string,
  actorSub: string,
): Promise<void> {
  await withTransaction(async (tx: any) => {
    const cur = await tx.query(ROUND_FOR_UPDATE, [roundId]);
    const r = cur.rows[0];
    if (!r) throw new DispatchError("not_found", "That round does not exist.");
    assertFresh(r.updated_at, expectedUpdatedAt);

    const own = await tx.query(`SELECT id FROM public.round_stop WHERE round_id = $1`, [roundId]);
    const owned = new Set(own.rows.map((s: any) => s.id));
    if (stopIds.length !== owned.size || stopIds.some((id) => !owned.has(id))) {
      // ⚠ Every stop, exactly once. A partial order would leave some stops with a seq and some
      // without, and the shared rule would then mix a manual order with a derived one.
      throw new DispatchError("invalid", "The order must list every stop on this round exactly once.");
    }

    for (const [i, id] of stopIds.entries()) {
      await tx.query(`UPDATE public.round_stop SET seq = $2 WHERE id = $1`, [id, i]);
    }
    await tx.query(`UPDATE public.driver_round SET updated_at = now() WHERE id = $1`, [roundId]);
    await audit(tx, actorSub, "dispatch.reorder", roundId, { stops: stopIds.length });
  });
}


/**
 * ⚠ Every manual change is recorded — who and when (FR-033).
 *
 * ⚠ THIS DELEGATES TO 056's WRITER RATHER THAN WRITING ITS OWN INSERT. The first draft of this file
 * had a private `audit()` doing exactly that — a second implementation of one rule, in a service that
 * already imports the first. `shared/audit.ts` also redacts PII field VALUES while recording that
 * they changed (056: an emergency contact is a third party who never dealt with Effy), and a
 * hand-rolled insert would have quietly skipped that.
 */
async function audit(tx: any, actorSub: string, action: DispatchAuditAction, targetId: string, detail: Record<string, unknown>) {
  await recordAudit({ actorSub, action, targetType: "driver_round", driverId: targetId, detail }, tx);
}
