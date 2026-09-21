// The dispatcher's overrides (063, US4).
//
// ⚠ A DISPATCHER MAY OVERRIDE A PREFERENCE. THEY MAY NOT OVERRIDE A FACT (FR-034). Reassigning to a
// driver the engine merely ranked lower is the whole point of this screen. Reassigning to one who is
// unlicensed, stood down, or holding no suitable vehicle is refused, naming the condition — those are
// not opinions the engine formed, they are things about the world.

import {
  eligibilityReasons,
  query,
  withTransaction,
  type ExclusionReason,
} from "@effy/edge-shared";

import { loadCandidates } from "../planner/repository";
import { recordAudit, type DispatchAuditAction } from "../shared/audit";
import { DAY_ROUNDS, RECENT_WAVES, ROUND_DETAIL_STOPS, ROUND_FOR_UPDATE, UNASSIGNED_WORK } from "./sql";

export class DispatchError extends Error {
  constructor(
    readonly kind: "not_found" | "stale" | "ineligible" | "locked" | "invalid",
    readonly detail: string,
    readonly reasons: ExclusionReason[] = [],
  ) {
    super(kind);
    this.name = "DispatchError";
  }
}

export async function readDay() {
  const [rounds, unassigned, waves] = await Promise.all([
    query<any>(DAY_ROUNDS),
    query<any>(UNASSIGNED_WORK),
    query<any>(RECENT_WAVES),
  ]);

  const now = Date.now();
  return {
    rounds: rounds.rows.map((r) => ({
      round: {
        id: r.id,
        kind: r.kind,
        status: r.status,
        deadlineAt: r.deadline_at.toISOString(),
        changedNote: r.changed_note,
        lockedBy: r.locked_by_sub,
        stops: [],
      },
      driverId: r.driver_id,
      driverName: r.driver_name,
      stopsRemaining: Number(r.stops_remaining),
      packagesRemaining: Number(r.packages_remaining),
      // ⚠ Derived on read, never stored (027's counted-not-stored rule). A stored `isLate` would be
      // wrong every minute nothing wrote to it.
      isLate: r.status !== "completed" && r.deadline_at.getTime() < now,
    })),
    unassigned: unassigned.rows.map((u) => ({
      packageId: u.package_id,
      orderNumber: u.order_number,
      shopName: u.shop_name,
      zoneName: u.zone_name,
      method: u.method,
      readySince: u.ready_since.toISOString(),
      // ⚠ An EMPTY array means no candidate existed at all — a staffing problem, not a fixable list.
      reasons: u.no_candidate ? [] : (u.reasons ?? []),
    })),
    waves: waves.rows.map((w) => ({
      id: w.id,
      kind: w.kind,
      plannedFor: w.planned_for.toISOString(),
      trigger: w.trigger,
      startedAt: w.started_at.toISOString(),
      finishedAt: w.finished_at ? w.finished_at.toISOString() : null,
      packagesConsidered: Number(w.packages_considered),
      packagesAssigned: Number(w.packages_assigned),
      packagesUnassigned: Number(w.packages_unassigned),
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
    lockedBy: r.locked_by_sub,
    updatedAt: r.updated_at,
    stops: stops.rows.map((s) => ({
      stopId: s.stop_id,
      seq: s.seq,
      kind: s.kind,
      status: s.status,
      zoneName: s.zone_name,
      label: s.shop_name ?? s.destination_suburb ?? "",
      orderNumber: s.order_number,
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

    const work = await tx.query(
      `SELECT COALESCE(SUM(oi.quantity * p.weight_grams), 0)::bigint AS weight,
              count(DISTINCT rs.id)::int                             AS stops,
              array_agg(DISTINCT rs.zone_id) FILTER (WHERE rs.zone_id IS NOT NULL) AS zones,
              bool_or(COALESCE(sf.delivery_method,'standard') = 'same_day')        AS any_same_day
         FROM public.round_stop rs
         LEFT JOIN public.round_package   rp ON rp.stop_id = rs.id AND rp.state = 'assigned'
         LEFT JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
         LEFT JOIN public.order_item       oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
         LEFT JOIN public.product           p ON p.id = oi.product_id
        WHERE rs.round_id = $1`,
      [roundId],
    );
    const w = work.rows[0];

    // ⚠ THE SAME RULE THE PLANNER USED, imported not retyped (research R5). If this service asked a
    // different question, a dispatcher could do what the planner would not — which is not a UI
    // inconsistency but a way to put an unlicensed driver in a van.
    const reasons = eligibilityReasons({
      driver: target,
      work: {
        function: r.kind,
        method: w.any_same_day ? "same_day" : "standard",
        zoneId: (w.zones ?? [])[0] ?? null,
        totalWeightGrams: Number(w.weight),
        requiresChilled: false,
        requiresFrozen: false,
        stopCount: Number(w.stops),
        deadlineAt: new Date(Date.now() + 8 * 3600_000),
      },
      now: new Date(),
      perStopAllowanceMin: 12,
    });

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

/** Mark an assignment as a person's decision (FR-032), or release it. */
export async function setLock(
  roundId: string,
  locked: boolean,
  expectedUpdatedAt: string,
  actorSub: string,
): Promise<void> {
  await withTransaction(async (tx: any) => {
    const cur = await tx.query(ROUND_FOR_UPDATE, [roundId]);
    const r = cur.rows[0];
    if (!r) throw new DispatchError("not_found", "That round does not exist.");
    assertFresh(r.updated_at, expectedUpdatedAt);

    await tx.query(
      locked
        ? `UPDATE public.driver_round SET locked_by_sub = $2, locked_at = now(), updated_at = now() WHERE id = $1`
        : `UPDATE public.driver_round SET locked_by_sub = NULL, locked_at = NULL, updated_at = now() WHERE id = $1`,
      locked ? [roundId, actorSub] : [roundId],
    );
    await audit(tx, actorSub, locked ? "dispatch.lock" : "dispatch.unlock", roundId, {});
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
