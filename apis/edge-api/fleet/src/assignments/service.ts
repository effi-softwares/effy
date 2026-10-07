// Assign to… and Unassign — a person's two actions on one package (073).
//
// ⚠ TWO ACTIONS, ON PURPOSE. The operator asked for simple: "Assign to…" gives a package to a driver
// (whether nobody has it, or someone else does — that is how a package is moved) and "Unassign" hands
// it back to auto-assign. There is no hold, no lock, no whole-round move here.
//
// ⚠ NO SECOND WAY OF PUTTING A PACKAGE ON A ROUND. Both actions go through the planner's own pieces:
// its gather (to know what the package is and weighs), its eligibility rule (`planWave` asked about
// just this driver) and `commitWave` (to place it, creating the stop or the round as the planner
// would). 072 found three defects of the shape "two implementations of one rule"; this adds none.
//
// ⚠ ONE PASS OR ONE PERSON AT A TIME. Every action takes the planner's advisory lock — blocking, so
// a person waits a moment rather than racing a pass — and locks the package's row.

import {
  endOfLocalDay,
  nextRunInstant,
  reasonSeverity,
  reasonWords,
  withTransaction,
  type ExclusionReason,
  type Queryable,
} from "@effy/edge-shared";

import { planWave } from "../planner/assign";
import {
  commitWave,
  gatherCollectionWork,
  gatherDeliveryWork,
  loadBucketRounds,
  loadCandidates,
  loadSchedule,
  roundOpensAt,
} from "../planner/repository";
import type { BucketRound, PlannablePackage, WavePlan } from "../planner/types";
import { deadlineFor } from "../planner/windows";
import { recordAudit } from "../shared/audit";

export type Stage = "collection" | "delivery";

/** A refusal, always with ONE line a person can read. */
export class AssignmentError extends Error {
  constructor(
    readonly kind: "cannot_take" | "needs_confirm" | "changed" | "collected" | "not_needed" | "not_found",
    readonly detail: string,
  ) {
    super(kind);
    this.name = "AssignmentError";
  }
}

export interface DriverFit {
  driverId: string;
  name: string;
  packagesToday: number;
  fit: "fine" | "concern" | "cannot";
  notes: string[];
}

const PASS_LOCK = `SELECT pg_advisory_xact_lock(72063001)`;

/** The package's current open assignment for a stage, with whether it may still move. */
async function currentAssignment(tx: Queryable, packageId: string, stage: Stage) {
  const res = await tx.query<{ id: string; stop_id: string; round_id: string; round_status: string; driver_id: string; driver_name: string }>(
    `SELECT rp.id, rp.stop_id, dr.id AS round_id, dr.status AS round_status, dr.driver_id, d.name AS driver_name
       FROM public.round_package rp
       JOIN public.round_stop   rs ON rs.id = rp.stop_id
       JOIN public.driver_round dr ON dr.id = rs.round_id AND dr.kind = $2
       JOIN public.driver        d ON d.id = dr.driver_id
      WHERE rp.shop_fulfillment_id = $1 AND rp.state = 'assigned'`,
    [packageId, stage],
  );
  return res.rows[0] ?? null;
}

/** Who has collected it, if anyone — the goods are then in a van and nothing here may move them. */
async function inVanWith(tx: Queryable, packageId: string, stage: Stage): Promise<string | null> {
  const res = await tx.query<{ name: string }>(
    `SELECT d.name
       FROM public.round_package rp
       JOIN public.round_stop   rs ON rs.id = rp.stop_id
       JOIN public.driver_round dr ON dr.id = rs.round_id AND dr.kind = $2
       JOIN public.driver        d ON d.id = dr.driver_id
      WHERE rp.shop_fulfillment_id = $1
        AND rp.state = 'picked_up'
        AND NOT EXISTS (SELECT 1 FROM public.hub_checkin hc WHERE hc.round_id = dr.id)
      ORDER BY rp.created_at DESC LIMIT 1`,
    [packageId, stage],
  );
  return res.rows[0]?.name ?? null;
}

/** The package as the planner sees it, for this stage — or null if it does not need a driver now. */
async function asPlannable(tx: Queryable, packageId: string, stage: Stage): Promise<PlannablePackage | null> {
  const found = stage === "collection" ? await gatherCollectionWork(tx, packageId) : await gatherDeliveryWork(tx, packageId);
  return found[0] ?? null;
}

/** The run or window the package belongs to — computed exactly as the planner computes it. */
async function bucketOf(tx: Queryable, stage: Stage, pkg: PlannablePackage, now: Date) {
  if (stage === "collection") {
    const { runs } = await loadSchedule(tx);
    const deadlineAt = nextRunInstant(runs, now);
    if (!deadlineAt) throw new AssignmentError("not_needed", "No collection run is scheduled, so there is no round to put it on.");
    return { deadlineAt, windowStartAt: null as Date | null };
  }
  const group = { windowStart: pkg.windowStart, windowEnd: pkg.windowEnd, packages: [pkg] };
  const deadlineAt = deadlineFor(group, now, endOfLocalDay(now));
  const windowStartAt = group.windowEnd !== null && deadlineAt.getTime() === group.windowEnd.getTime() ? group.windowStart : null;
  return { deadlineAt, windowStartAt };
}

/** Ask the planner's own rule about ONE driver: what, if anything, stands in the way. */
async function reasonsFor(tx: Queryable, stage: Stage, pkg: PlannablePackage, driverId: string, now: Date) {
  const { settings } = await loadSchedule(tx);
  const { deadlineAt, windowStartAt } = await bucketOf(tx, stage, pkg, now);
  const candidates = (await loadCandidates(tx)).filter((c) => c.driverId === driverId);
  const rounds = (await loadBucketRounds(tx, stage, deadlineAt, windowStartAt)).filter((r) => r.driverId === driverId);
  const opensAt = await roundOpensAt(tx, stage, deadlineAt, windowStartAt);
  const plan = planWave({
    kind: stage,
    packages: [pkg],
    candidates,
    plannedFor: now,
    deadlineAt,
    now,
    perStopAllowanceMin: settings.perStopAllowanceMin,
    opensAt,
    windowStartAt,
    rounds,
  });
  const reasons = [...new Set(plan.exclusions.filter((e) => e.driverId === driverId).map((e) => e.reason))];
  return { reasons: candidates.length === 0 ? (["not_employable"] as ExclusionReason[]) : reasons, deadlineAt, windowStartAt, rounds, candidate: candidates[0] };
}

function fitOf(reasons: readonly ExclusionReason[]): DriverFit["fit"] {
  if (reasons.some((r) => reasonSeverity(r) === "cannot")) return "cannot";
  return reasons.length > 0 ? "concern" : "fine";
}

/**
 * Every active driver, with whether they can take this package: fine first, then concerns, then
 * those who cannot — each with a few plain words (US3, FR-012).
 */
export async function driversFor(packageId: string, stage: Stage, now = new Date()): Promise<DriverFit[]> {
  return withTransaction(async (tx: Queryable) => {
    const pkg = await asPlannable(tx, packageId, stage);
    if (!pkg) throw new AssignmentError("not_needed", "This package doesn't need a driver for that right now.");
    const current = await currentAssignment(tx, packageId, stage);
    const all = await loadCandidates(tx);
    const out: DriverFit[] = [];
    for (const d of all.filter((c) => c.status === "active")) {
      const { reasons } = await reasonsFor(tx, stage, pkg, d.driverId, now);
      const fit = fitOf(reasons);
      out.push({
        driverId: d.driverId,
        name: d.driverName,
        packagesToday: d.packagesAssignedToday,
        fit,
        notes: [
          ...(current?.driver_id === d.driverId ? ["Has it now"] : []),
          ...reasons.map(reasonWords),
        ],
      });
    }
    const rank = { fine: 0, concern: 1, cannot: 2 } as const;
    return out.sort((a, b) => rank[a.fit] - rank[b.fit] || a.packagesToday - b.packagesToday || a.name.localeCompare(b.name));
  });
}

/** Take a package off its round, tidying a stop or a not-yet-begun round it leaves empty. */
async function removeAssignment(tx: Queryable, current: { id: string; stop_id: string; round_id: string; round_status: string }) {
  await tx.query(`DELETE FROM public.round_package WHERE id = $1`, [current.id]);
  await tx.query(
    `DELETE FROM public.round_stop rs
      WHERE rs.id = $1 AND NOT EXISTS (SELECT 1 FROM public.round_package rp WHERE rp.stop_id = rs.id)`,
    [current.stop_id],
  );
  await tx.query(
    `UPDATE public.driver_round dr SET status = 'cancelled', updated_at = now()
      WHERE dr.id = $1 AND dr.status = 'planned'
        AND NOT EXISTS (SELECT 1 FROM public.round_stop rs JOIN public.round_package rp ON rp.stop_id = rs.id
                         WHERE rs.round_id = dr.id)`,
    [current.round_id],
  );
  await tx.query(`UPDATE public.driver_round SET updated_at = now() WHERE id = $1`, [current.round_id]);
}

/** Lock, load, and refuse anything a person may not do to this package (shared by both actions). */
async function prepare(tx: Queryable, packageId: string, stage: Stage, expectedAssignmentId: string | null) {
  await tx.query(PASS_LOCK);
  const row = await tx.query(`SELECT id FROM public.shop_fulfillment WHERE id = $1 FOR UPDATE`, [packageId]);
  if (row.rowCount === 0) throw new AssignmentError("not_found", "That package doesn't exist.");

  const current = await currentAssignment(tx, packageId, stage);
  if ((current?.id ?? null) !== expectedAssignmentId) {
    throw new AssignmentError("changed", "This changed a moment ago — showing the latest.");
  }
  // ⚠ The goods have left: collected and in a van, or out on a delivery round under way.
  const holder = await inVanWith(tx, packageId, stage);
  if (holder) throw new AssignmentError("collected", `It's already in ${holder}'s van.`);
  if (current && stage === "delivery" && current.round_status === "in_progress") {
    throw new AssignmentError("collected", `It's already out with ${current.driver_name}.`);
  }
  return current;
}

async function staffName(tx: Queryable, sub: string): Promise<string> {
  const res = await tx.query<{ name: string | null; email: string }>(`SELECT name, email FROM admin.staff WHERE cognito_sub = $1`, [sub]);
  const r = res.rows[0];
  return r?.name?.trim() || r?.email || "a staff member";
}

/**
 * Give a package to a driver — whether nobody has it or somebody else does (US3).
 *
 * Returns the one line to show, and the drivers whose apps must hear about it.
 */
export async function assignTo(input: {
  packageId: string;
  stage: Stage;
  driverId: string;
  expectedAssignmentId: string | null;
  acceptConcerns: boolean;
  actorSub: string;
  now?: Date;
}): Promise<{ message: string; driverIds: string[] }> {
  const now = input.now ?? new Date();
  return withTransaction(async (tx: Queryable) => {
    const current = await prepare(tx, input.packageId, input.stage, input.expectedAssignmentId);
    if (current?.driver_id === input.driverId) {
      return { message: `Already with ${current.driver_name}`, driverIds: [] };
    }

    const pkg = await asPlannable(tx, input.packageId, input.stage);
    if (!pkg) throw new AssignmentError("not_needed", "This package doesn't need a driver for that right now.");

    // Asked BEFORE the current assignment is removed, so a refusal leaves everything as it was.
    const { reasons, deadlineAt, windowStartAt, rounds, candidate } = await reasonsFor(tx, input.stage, pkg, input.driverId, now);
    const cannot = reasons.filter((r) => reasonSeverity(r) === "cannot");
    if (cannot.length > 0) {
      throw new AssignmentError("cannot_take", `${candidate?.driverName ?? "That driver"} can't take it — ${cannot.map(reasonWords).join(", ").toLowerCase()}.`);
    }
    if (reasons.length > 0 && !input.acceptConcerns) {
      throw new AssignmentError("needs_confirm", `${reasons.map(reasonWords).join(", ")}. Assign anyway?`);
    }

    if (current) await removeAssignment(tx, current);

    const who = await staffName(tx, input.actorSub);
    const note = reasons.length > 0
      ? `Assigned by ${who} — accepted: ${reasons.map(reasonWords).join(", ").toLowerCase()}`
      : `Assigned by ${who}`;

    // Where it goes — the planner's own preference order: the driver's not-yet-begun round for this
    // run or window; else a stop they are still to make on a round under way; else a new round.
    const mine: BucketRound[] = rounds.filter((r) => r.driverId === input.driverId && r.roundId !== current?.round_id);
    const key = input.stage === "collection" ? pkg.shopId : (pkg.orderId ?? pkg.packageId);
    const target =
      mine.find((r) => r.status === "planned") ??
      (input.stage === "collection" ? mine.find((r) => r.status === "in_progress" && r.stops.some((s) => s.key === key && s.outstanding)) : undefined);

    const plan: WavePlan = {
      kind: input.stage,
      plannedFor: now,
      deadlineAt,
      windowStartAt,
      assignments: target ? new Map() : new Map([[input.driverId, [pkg]]]),
      additions: target ? new Map([[target.roundId, [pkg]]]) : new Map(),
      unassigned: [],
      notes: new Map([[pkg.packageId, note]]),
      assignedBySub: input.actorSub,
      exclusions: [],
      considered: 1,
    };
    const { assigned } = await commitWave(plan, "manual", input.actorSub, null, tx);
    if (assigned === 0) throw new AssignmentError("changed", "This changed a moment ago — showing the latest.");

    // Nobody-can-take-it reasons no longer apply to a package somebody has.
    await tx.query(`DELETE FROM public.assignment_exclusion WHERE shop_fulfillment_id = $1 AND kind = $2`, [input.packageId, input.stage]);
    await recordAudit(
      { actorSub: input.actorSub, action: "dispatch.manual_assign", targetType: "driver_round", driverId: input.driverId,
        detail: { packageId: input.packageId, stage: input.stage, from: current?.driver_id ?? null, acceptedConcerns: reasons } },
      tx as never,
    );

    return {
      message: `Assigned to ${candidate?.driverName ?? "the driver"}`,
      driverIds: [input.driverId, ...(current ? [current.driver_id] : [])],
    };
  });
}

/** Hand a package back to auto-assign (US3). */
export async function unassign(input: {
  packageId: string;
  stage: Stage;
  expectedAssignmentId: string;
  actorSub: string;
}): Promise<{ message: string; driverIds: string[] }> {
  return withTransaction(async (tx: Queryable) => {
    const current = await prepare(tx, input.packageId, input.stage, input.expectedAssignmentId);
    if (!current) throw new AssignmentError("changed", "This changed a moment ago — showing the latest.");
    await removeAssignment(tx, current);
    await recordAudit(
      { actorSub: input.actorSub, action: "dispatch.manual_unassign", targetType: "driver_round", driverId: current.driver_id,
        detail: { packageId: input.packageId, stage: input.stage } },
      tx as never,
    );
    return {
      message: "Unassigned — auto-assign will pick it up within 5 minutes",
      driverIds: [current.driver_id],
    };
  });
}
