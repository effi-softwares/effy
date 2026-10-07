// The planner's data layer (063). Raw parameterised SQL; rows are mapped to domain here and the row
// shapes never escape (Principle VI).

import { query, withTransaction, type CollectionRun, type Queryable } from "@effy/edge-shared";

import {
  BUCKET_ROUNDS,
  CANDIDATE_DRIVERS,
  COLLECTION_SCHEDULE,
  GATHER_COLLECTION,
  GATHER_DELIVERY,
  PLANNER_SETTINGS,
  ROUND_OPENS_AT,
  STANDING_EXCLUSIONS,
  TRY_PASS_LOCK,
} from "./sql";
import type {
  BucketRound,
  PlannablePackage,
  PlannedExclusion,
  PlannerCandidate,
  PlannerSettings,
  WavePlan,
} from "./types";

// ⚠ EVERY READ AND WRITE HERE TAKES THE CONNECTION IT RUNS ON (072). A pass is ONE transaction under
// an advisory lock — release, assign, record reasons — so a function that quietly used the module
// pool would read a world the pass has not committed yet, or write outside the lock. `pooled` is the
// default only so a caller that genuinely wants a standalone read (the reassign route's candidate
// load) does not have to open a transaction to get one.
const pooled: Queryable = { query: (text, values) => query(text, values) };

interface GatherRow {
  package_id: string;
  order_number: string;
  shop_id: string;
  shop_name: string;
  order_id?: string;
  recipient_name?: string | null;
  address_line1: string | null;
  address_line2: string | null;
  suburb: string | null;
  postcode: string | null;
  state: string | null;
  method: "standard" | "same_day";
  zone_id: string | null;
  zone_name: string | null;
  ready_since: Date;
  weight_grams: string;
  item_count: string;
  requires_chilled: boolean | null;
  requires_frozen: boolean | null;
  /** Selected by the delivery gather only; absent from collection rows. */
  window_start?: Date | null;
  window_end?: Date | null;
}

/** ⚠ One line a driver can read and hand to their maps app (D7). Never a coordinate. */
function addressLine(r: GatherRow): string {
  return [r.address_line1, r.address_line2, r.suburb, r.state, r.postcode]
    .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    .join(", ");
}

function mapPackage(r: GatherRow): PlannablePackage {
  return {
    packageId: r.package_id,
    orderNumber: r.order_number,
    shopId: r.shop_id,
    shopName: r.shop_name,
    address: addressLine(r),
    orderId: r.order_id ?? null,
    recipientName: r.recipient_name ?? null,
    method: r.method,
    zoneId: r.zone_id,
    zoneName: r.zone_name,
    readySince: r.ready_since.toISOString(),
    // ⚠ bigint arrives as a string from `pg`. Number() here, at the boundary, so nothing downstream
    // does string arithmetic on a weight and silently concatenates (027's R13 shape, one layer up).
    weightGrams: Number(r.weight_grams),
    itemCount: Number(r.item_count),
    requiresChilled: r.requires_chilled === true,
    requiresFrozen: r.requires_frozen === true,
    windowStart: r.window_start ?? null,
    windowEnd: r.window_end ?? null,
  };
}

export async function gatherCollectionWork(db: Queryable = pooled): Promise<PlannablePackage[]> {
  const res = await db.query<GatherRow>(GATHER_COLLECTION);
  return res.rows.map(mapPackage);
}

export async function gatherDeliveryWork(db: Queryable = pooled): Promise<PlannablePackage[]> {
  const res = await db.query<GatherRow>(GATHER_DELIVERY);
  return res.rows.map(mapPackage);
}

interface CandidateRow {
  driver_id: string;
  driver_name: string;
  status: "active" | "suspended" | "offboarded";
  licence_expires_on: Date | null;
  expected_end_at: Date | null;
  on_duty: boolean;
  vehicle_id: string | null;
  payload_kg: number | null;
  can_carry_chilled: boolean;
  can_carry_frozen: boolean;
  clearances: Array<{ function: "collection" | "delivery"; method: "standard" | "same_day"; zoneId: string | null }>;
  packages_assigned_today: string;
}

export async function loadCandidates(db: Queryable = pooled): Promise<PlannerCandidate[]> {
  const res = await db.query<CandidateRow>(CANDIDATE_DRIVERS);
  return res.rows.map((r) => ({
    driverId: r.driver_id,
    driverName: r.driver_name,
    status: r.status,
    onDuty: r.on_duty,
    licenceExpiresOn: r.licence_expires_on ? r.licence_expires_on.toISOString().slice(0, 10) : null,
    expectedEndAt: r.expected_end_at ? r.expected_end_at.toISOString() : null,
    vehicle: r.vehicle_id
      ? {
          vehicleId: r.vehicle_id,
          payloadKg: r.payload_kg,
          canCarryChilled: r.can_carry_chilled,
          canCarryFrozen: r.can_carry_frozen,
        }
      : null,
    clearances: r.clearances ?? [],
    packagesAssignedToday: Number(r.packages_assigned_today),
  }));
}

export async function loadSchedule(
  db: Queryable = pooled,
): Promise<{ runs: CollectionRun[]; settings: PlannerSettings }> {
  // ⚠ Sequential, not Promise.all: on a transaction's single connection two queries cannot overlap.
  const runsRes = await db.query<{ hour: number; minute: number }>(COLLECTION_SCHEDULE);
  const setRes = await db.query<{
    sameday_prep_buffer_min: number;
    planning_lead_min: number;
    per_stop_allowance_min: number;
  }>(PLANNER_SETTINGS);
  const s = setRes.rows[0];
  return {
    runs: runsRes.rows.map((r) => ({ hour: r.hour, minute: r.minute })),
    settings: {
      // No settings row yet means no schedule configured — the caller plans nothing rather than
      // inventing a buffer (047's SameDaySchedule takes the same position).
      prepBufferMin: s?.sameday_prep_buffer_min ?? 0,
      planningLeadMin: s?.planning_lead_min ?? 45,
      perStopAllowanceMin: s?.per_stop_allowance_min ?? 12,
    },
  };
}

/** Take the pass lock for this transaction. False means another pass holds it — do nothing. */
export async function tryPassLock(tx: Queryable): Promise<boolean> {
  const res = await tx.query<{ locked: boolean }>(TRY_PASS_LOCK);
  return res.rows[0]?.locked === true;
}

/**
 * When a round for this run or window opens. ⚠ ASKED OF THE DATABASE, not computed here: the
 * driver's action gate and the dispatch view call the same function, and a TypeScript copy of
 * "deadline minus the lead" would be the second definition research R3 exists to prevent.
 */
export async function roundOpensAt(
  db: Queryable,
  kind: "collection" | "delivery",
  deadlineAt: Date,
  windowStartAt: Date | null,
): Promise<Date | null> {
  const res = await db.query<{ opens_at: Date | null }>(ROUND_OPENS_AT, [kind, deadlineAt, windowStartAt]);
  return res.rows[0]?.opens_at ?? null;
}

/** The unlocked rounds that already exist for one run or window, oldest first (072, research R4). */
export async function loadBucketRounds(
  db: Queryable,
  kind: "collection" | "delivery",
  deadlineAt: Date,
  windowStartAt: Date | null,
): Promise<BucketRound[]> {
  const res = await db.query<{
    round_id: string;
    driver_id: string;
    status: "planned" | "in_progress";
    stop_id: string | null;
    stop_kind: "shop_pickup" | "customer_drop" | "hub_checkin" | null;
    shop_id: string | null;
    order_id: string | null;
    outstanding: boolean | null;
    stop_weight_grams: string;
  }>(BUCKET_ROUNDS, [kind, deadlineAt, windowStartAt]);

  const rounds = new Map<string, { roundId: string; driverId: string; status: "planned" | "in_progress"; weightGrams: number; stops: Array<{ key: string; outstanding: boolean }> }>();
  for (const r of res.rows) {
    let round = rounds.get(r.round_id);
    if (!round) {
      round = { roundId: r.round_id, driverId: r.driver_id, status: r.status, weightGrams: 0, stops: [] };
      rounds.set(r.round_id, round);
    }
    round.weightGrams += Number(r.stop_weight_grams);
    // ⚠ The hub is where a collection round ENDS, not a stop work can be added to, and it is not
    // counted against the time a round takes — it never was (063 counted shops only).
    const key = r.stop_kind === "shop_pickup" ? r.shop_id : r.stop_kind === "customer_drop" ? r.order_id : null;
    if (key) round.stops.push({ key, outstanding: r.outstanding === true });
  }
  return [...rounds.values()];
}

/**
 * Write everything a pass decided for one run or window.
 *
 * ⚠ THE PARTIAL UNIQUE INDEX IS WHAT MAKES A PACKAGE EXCLUSIVE, NOT THIS FUNCTION (FR-005, research
 * R6). A conflict is an ORDINARY OUTCOME meaning "somebody else already assigned it" — not an error —
 * and is swallowed per row with `ON CONFLICT DO NOTHING` rather than failing the pass.
 *
 * ⚠ 072 — NO WAVE ROW UNLESS SOMETHING IS ASSIGNED. The planner runs every few minutes all day; a
 * `dispatch_wave` row per pass per window would be a log of nothing happening. The row is created
 * lazily, by the first insert that needs a round to belong to it, and deleted again if every insert
 * turned out to be a conflict.
 *
 * Called with the pass's own transaction. With none, it opens one (the container tests' callers).
 */
export async function commitWave(
  plan: WavePlan,
  trigger: "schedule" | "manual",
  triggeredBySub: string | null,
  runId: string | null,
  db?: Queryable,
): Promise<{ waveId: string | null; assigned: number; driverIds: string[] }> {
  if (!db) return withTransaction((tx: Queryable) => commitWave(plan, trigger, triggeredBySub, runId, tx));
  const tx = db;

  if (plan.assignments.size === 0 && plan.additions.size === 0) {
    return { waveId: null, assigned: 0, driverIds: [] };
  }

  const wave = await tx.query<{ id: string }>(
    `INSERT INTO public.dispatch_wave
       (run_id, kind, planned_for, trigger, triggered_by_sub, packages_considered)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [runId, plan.kind, plan.plannedFor, trigger, triggeredBySub, plan.considered],
  );
  const waveId = wave.rows[0]!.id;
  let assigned = 0;
  const driverIds = new Set<string>();

  const stopKind = plan.kind === "collection" ? "shop_pickup" : "customer_drop";
  const keyOf = (p: PlannablePackage) => (plan.kind === "collection" ? p.shopId : (p.orderId ?? p.packageId));

  const insertStop = async (roundId: string, head: PlannablePackage): Promise<string> => {
    const stop = await tx.query<{ id: string }>(
      `INSERT INTO public.round_stop (round_id, kind, shop_id, order_id, zone_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        roundId,
        stopKind,
        plan.kind === "collection" ? head.shopId : null,
        plan.kind === "collection" ? null : head.orderId,
        head.zoneId,
      ],
    );
    return stop.rows[0]!.id;
  };

  const insertPackage = async (stopId: string, p: PlannablePackage): Promise<boolean> => {
    const ins = await tx.query(
      `INSERT INTO public.round_package (stop_id, shop_fulfillment_id)
       VALUES ($1, $2)
       ON CONFLICT (shop_fulfillment_id) WHERE state = 'assigned' DO NOTHING
       RETURNING id`,
      [stopId, p.packageId],
    );
    return (ins.rowCount ?? 0) > 0;
  };

  /** One stop per shop (collection) or per order (delivery) — adjacency by construction (FR-019). */
  const groupByStop = (packages: PlannablePackage[]) => {
    const groups = new Map<string, PlannablePackage[]>();
    for (const p of packages) {
      const g = groups.get(keyOf(p));
      if (g) g.push(p);
      else groups.set(keyOf(p), [p]);
    }
    return groups;
  };

  // ── New rounds ───────────────────────────────────────────────────────────────────────────────
  for (const [driverId, packages] of plan.assignments) {
    const round = await tx.query<{ id: string }>(
      `INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at, window_start_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [waveId, driverId, plan.kind, plan.deadlineAt, plan.windowStartAt],
    );
    const roundId = round.rows[0]!.id;
    let placed = 0;

    for (const group of groupByStop(packages).values()) {
      const stopId = await insertStop(roundId, group[0]!);
      for (const p of group) if (await insertPackage(stopId, p)) placed += 1;
    }

    if (placed === 0) {
      // Every package was taken by somebody else first. A round of empty stops is not a round.
      await tx.query(`DELETE FROM public.driver_round WHERE id = $1`, [roundId]);
      continue;
    }
    assigned += placed;
    driverIds.add(driverId);

    // ⚠ 064 — A COLLECTION ROUND ENDS AT THE HUB, AND THAT ENDING IS A STOP.
    //
    // `round_stop_kind_check` has permitted `'hub_checkin'` since 063 and nothing created one. Found
    // live on 2026-09-21: `todayView`'s outstanding filter keeps only unfinished stops, so the moment
    // the last shop stop went `done` the driver's home screen had nothing left — and BOTH routes
    // into the round disappeared together, with thirteen packages in the van.
    //
    // ⚠ It carries NEITHER a shop nor an order — the same CHECK requires both to be NULL for this
    // kind. A delivery round has no equivalent: it ends at the last customer, not back at the hub.
    if (plan.kind === "collection") {
      await tx.query(`INSERT INTO public.round_stop (round_id, kind) VALUES ($1, 'hub_checkin')`, [roundId]);
    }
  }

  // ── Rounds that already exist (072) ──────────────────────────────────────────────────────────
  for (const [roundId, packages] of plan.additions) {
    // ⚠ Re-read under the pass's transaction and REFUSED IF LOCKED OR FINISHED. The plan was made
    // from a read a moment ago; a dispatcher may have locked the round since (FR-019).
    const cur = await tx.query<{ driver_id: string; status: string }>(
      `SELECT driver_id, status FROM public.driver_round
        WHERE id = $1 AND locked_by_sub IS NULL AND status IN ('planned', 'in_progress')
        FOR UPDATE`,
      [roundId],
    );
    const round = cur.rows[0];
    if (!round) continue; // left for the next pass, which will see the round as it now is

    const added: PlannablePackage[] = [];
    for (const [key, group] of groupByStop(packages)) {
      const found = await tx.query<{ id: string }>(
        `SELECT id FROM public.round_stop
          WHERE round_id = $1 AND kind = $2
            AND COALESCE(shop_id, order_id)::text = $3
            AND status NOT IN ('done', 'skipped')
          ORDER BY id LIMIT 1`,
        [roundId, stopKind, key],
      );
      // ⚠ A stop is CREATED only on a round not yet begun. Under way, work joins a stop the driver
      // still has to make or it does not join at all (FR-004a) — a new stop on a round in progress
      // would send somebody back to a shop they have already left.
      let stopId = found.rows[0]?.id ?? null;
      if (!stopId && round.status === "planned") stopId = await insertStop(roundId, group[0]!);
      if (!stopId) continue;
      for (const p of group) if (await insertPackage(stopId, p)) added.push(p);
    }
    if (added.length === 0) continue;

    assigned += added.length;
    driverIds.add(round.driver_id);

    // ⚠ FR-004b — a driver WORKING a round must be TOLD it changed. A round that grows silently
    // underneath somebody working it is worse than one that never grows.
    // ⚠ 072 FR-018 — and ONLY then. A round not yet begun fills up over hours; a note per package
    // would be noise about something nobody has started. It simply shows what it now contains.
    const note =
      round.status === "in_progress"
        ? added.map((p) => `Added ${p.orderNumber}${plan.kind === "collection" ? ` at ${p.shopName}` : ""}.`).join(" ")
        : null;
    // `updated_at` moves either way: it is the dispatcher's concurrency token, and it is how the
    // pass knows whose app to tell.
    await tx.query(
      `UPDATE public.driver_round
          SET changed_note = CASE WHEN $2::text IS NULL THEN changed_note
                                  ELSE COALESCE(changed_note || ' ', '') || $2 END,
              updated_at = now()
        WHERE id = $1`,
      [roundId, note],
    );
  }

  if (assigned === 0) {
    await tx.query(`DELETE FROM public.dispatch_wave WHERE id = $1`, [waveId]);
    return { waveId: null, assigned: 0, driverIds: [] };
  }

  await tx.query(
    `UPDATE public.dispatch_wave
        SET finished_at = now(), packages_assigned = $2, packages_unassigned = $3
      WHERE id = $1`,
    [waveId, assigned, plan.considered - assigned],
  );
  return { waveId, assigned, driverIds: [...driverIds] };
}

/**
 * Make the standing "nobody can take this" rows for one kind say what is true now (072, R9).
 *
 * ⚠ WRITTEN ONLY WHEN THEY CHANGE. The planner runs every few minutes; a package nobody is cleared
 * for would otherwise be rewritten 288 times a day, and back-office would be told its screen had
 * changed 288 times when nothing on it had. Returns whether anything was written.
 */
export async function replaceExclusions(
  tx: Queryable,
  kind: "collection" | "delivery",
  exclusions: readonly PlannedExclusion[],
): Promise<boolean> {
  const keyOf = (packageId: string, driverId: string | null, reason: string) =>
    `${packageId}|${driverId ?? ""}|${reason}`;

  // De-duplicated: one driver can fail the same condition for one package twice in a pass — once
  // against the round already visiting that shop, once against a fresh round.
  const wanted = new Map<string, PlannedExclusion>();
  for (const e of exclusions) wanted.set(keyOf(e.packageId, e.driverId, e.reason), e);

  const stored = await tx.query<{ shop_fulfillment_id: string; driver_id: string | null; reason: string }>(
    STANDING_EXCLUSIONS,
    [kind],
  );
  const have = new Set(stored.rows.map((r) => keyOf(r.shop_fulfillment_id, r.driver_id, r.reason)));

  const same = have.size === wanted.size && [...wanted.keys()].every((k) => have.has(k));
  if (same) return false;

  await tx.query(`DELETE FROM public.assignment_exclusion WHERE kind = $1`, [kind]);
  for (const e of wanted.values()) {
    await tx.query(
      `INSERT INTO public.assignment_exclusion (kind, shop_fulfillment_id, driver_id, reason)
       VALUES ($1, $2, $3, $4)`,
      [kind, e.packageId, e.driverId, e.reason],
    );
  }
  return true;
}
