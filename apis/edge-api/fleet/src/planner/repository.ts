import { query, withTransaction, type CollectionRun, type Queryable } from "@effy/edge-shared";

import { enqueueRoundChanged, enqueueRunAssigned } from "../shared/driver-push";

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

// Every read and write takes the connection it runs on: a pass is one transaction under an advisory
// lock. `pooled` is the default only for standalone reads (the reassign route's candidate load).
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
  /** The collection gather selects it; a delivery row is Effy's by construction. */
  delivered_by?: "effy" | "courier";
  zone_id: string | null;
  zone_name: string | null;
  ready_since: Date;
  weight_grams: string;
  item_count: string;
  requires_chilled: boolean | null;
  requires_frozen: boolean | null;
  window_start?: Date | null;
  window_end?: Date | null;
  /** The driver whose collection run brought it to the hub. */
  collected_by?: string | null;
}

/** One line for the driver's maps app. Never a coordinate. */
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
    deliveredBy: r.delivered_by ?? "effy",
    zoneId: r.zone_id,
    zoneName: r.zone_name,
    readySince: r.ready_since.toISOString(),
    // `pg` returns bigint as a string: converted here so nothing concatenates a weight.
    weightGrams: Number(r.weight_grams),
    itemCount: Number(r.item_count),
    requiresChilled: r.requires_chilled === true,
    requiresFrozen: r.requires_frozen === true,
    windowStart: r.window_start ?? null,
    windowEnd: r.window_end ?? null,
    collectedBy: r.collected_by ?? null,
  };
}

export async function gatherCollectionWork(db: Queryable = pooled, onlyPackageId: string | null = null): Promise<PlannablePackage[]> {
  const res = await db.query<GatherRow>(GATHER_COLLECTION, [onlyPackageId]);
  return res.rows.map(mapPackage);
}

/** `throughEndOf` is the local day being planned; a later window waits at the hub. Required, never defaulted. */
export async function gatherDeliveryWork(db: Queryable, onlyPackageId: string | null, throughEndOf: Date): Promise<PlannablePackage[]> {
  const res = await db.query<GatherRow>(GATHER_DELIVERY, [onlyPackageId, throughEndOf]);
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
  clearances: Array<{ function: "collection" | "delivery"; zoneId: string | null }>;
  packages_assigned_today: string;
  vehicle_check?: "none" | "ok" | "due" | "unsafe";
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
    // `none` is already `no_vehicle`; only a held vehicle's check is its own reason.
    ...(r.vehicle_check === "due" || r.vehicle_check === "unsafe" ? { vehicleCheck: r.vehicle_check } : {}),
  }));
}

export async function loadSchedule(
  db: Queryable = pooled,
): Promise<{ runs: CollectionRun[]; settings: PlannerSettings }> {
  // Sequential: on a transaction's single connection two queries cannot overlap.
  const runsRes = await db.query<{ hour: number; minute: number }>(COLLECTION_SCHEDULE);
  const setRes = await db.query<{
    sameday_prep_buffer_min: number;
    planning_lead_min: number;
    per_stop_allowance_min: number;
    sameday_hub_turnaround_min: number | null;
    standard_no_delivery_weekdays: number[] | null;
  }>(PLANNER_SETTINGS);
  const s = setRes.rows[0];
  return {
    runs: runsRes.rows.map((r) => ({ hour: r.hour, minute: r.minute })),
    settings: {
      // No settings row means no schedule: plan nothing rather than invent a buffer.
      prepBufferMin: s?.sameday_prep_buffer_min ?? 0,
      planningLeadMin: s?.planning_lead_min ?? 45,
      perStopAllowanceMin: s?.per_stop_allowance_min ?? 12,
      // What `collectionRunFor` needs: the hub's handling time and the weekdays with no deliveries.
      hubTurnaroundMin: s?.sameday_hub_turnaround_min ?? 60,
      noDeliveryWeekdays: s?.standard_no_delivery_weekdays ?? [],
    },
  };
}

/** False means another pass holds it: do nothing. */
export async function tryPassLock(tx: Queryable): Promise<boolean> {
  const res = await tx.query<{ locked: boolean }>(TRY_PASS_LOCK);
  return res.rows[0]?.locked === true;
}

/** Asked of the database (`public.round_opens_at`), the definition the driver gate and dispatch also use. */
export async function roundOpensAt(
  db: Queryable,
  kind: "collection" | "delivery",
  deadlineAt: Date,
  windowStartAt: Date | null,
): Promise<Date | null> {
  const res = await db.query<{ opens_at: Date | null }>(ROUND_OPENS_AT, [kind, deadlineAt, windowStartAt]);
  return res.rows[0]?.opens_at ?? null;
}

/** Oldest first. */
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
    // The hub ends a collection round; work is never added to it and it does not count against time.
    const key = r.stop_kind === "shop_pickup" ? r.shop_id : r.stop_kind === "customer_drop" ? r.order_id : null;
    if (key) round.stops.push({ key, outstanding: r.outstanding === true });
  }
  return [...rounds.values()];
}

/**
 * Writes what a pass decided for one run or window. The partial unique index makes a package
 * exclusive: a conflict ("someone else assigned it") is swallowed per row. A `dispatch_wave` row is
 * created only when something is assigned, and deleted if every insert conflicted. Opens a
 * transaction when given none.
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
      `INSERT INTO public.round_package (stop_id, shop_fulfillment_id, assigned_note, assigned_by_sub)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (shop_fulfillment_id) WHERE state = 'assigned' DO NOTHING
       RETURNING id`,
      [stopId, p.packageId, plan.notes.get(p.packageId) ?? null, plan.assignedBySub ?? null],
    );
    return (ins.rowCount ?? 0) > 0;
  };

  /** One stop per shop (collection) or per order (delivery). */
  const groupByStop = (packages: PlannablePackage[]) => {
    const groups = new Map<string, PlannablePackage[]>();
    for (const p of packages) {
      const g = groups.get(keyOf(p));
      if (g) g.push(p);
      else groups.set(keyOf(p), [p]);
    }
    return groups;
  };

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
      // Every package was taken first by someone else: no round.
      await tx.query(`DELETE FROM public.driver_round WHERE id = $1`, [roundId]);
      continue;
    }
    assigned += placed;
    driverIds.add(driverId);
    await enqueueRunAssigned(tx, roundId);

    // A collection round ends with a `hub_checkin` stop (no shop, no order), so it stays open until the load is in.
    if (plan.kind === "collection") {
      await tx.query(`INSERT INTO public.round_stop (round_id, kind) VALUES ($1, 'hub_checkin')`, [roundId]);
    }
  }

  for (const [roundId, packages] of plan.additions) {
    // Re-read under the pass's transaction and refused if finished since the plan was made.
    const cur = await tx.query<{ driver_id: string; status: string }>(
      `SELECT driver_id, status FROM public.driver_round
        WHERE id = $1 AND status IN ('planned', 'in_progress')
        FOR UPDATE`,
      [roundId],
    );
    const round = cur.rows[0];
    if (!round) continue;

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
      // A stop is created only on an unstarted round; under way, work joins a stop still to make or not at all.
      let stopId = found.rows[0]?.id ?? null;
      if (!stopId && round.status === "planned") stopId = await insertStop(roundId, group[0]!);
      if (!stopId) continue;
      for (const p of group) if (await insertPackage(stopId, p)) added.push(p);
    }
    if (added.length === 0) continue;

    assigned += added.length;
    driverIds.add(round.driver_id);
    // A no-op for a round the driver was already told about.
    await enqueueRunAssigned(tx, roundId);

    // A driver working a round is told it changed; an unstarted round just shows what it now holds.
    const note =
      round.status === "in_progress"
        ? added.map((p) => `Added ${p.orderNumber}${plan.kind === "collection" ? ` at ${p.shopName}` : ""}.`).join(" ")
        : null;
    // `updated_at` moves either way: the dispatcher's concurrency token, and how the pass knows whom to tell.
    await tx.query(
      `UPDATE public.driver_round
          SET changed_note = CASE WHEN $2::text IS NULL THEN changed_note
                                  ELSE COALESCE(changed_note || ' ', '') || $2 END,
              updated_at = now()
        WHERE id = $1`,
      [roundId, note],
    );
    // A round under way grew: "Run updated".
    await enqueueRoundChanged(tx, roundId, round.driver_id);
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

/** Written only when they change, so a stuck package is not rewritten 288 times a day. Returns whether anything was written. */
export async function replaceExclusions(
  tx: Queryable,
  kind: "collection" | "delivery",
  exclusions: readonly PlannedExclusion[],
): Promise<boolean> {
  const keyOf = (packageId: string, driverId: string | null, reason: string) =>
    `${packageId}|${driverId ?? ""}|${reason}`;

  // De-duplicated: a driver can fail one condition twice in a pass (visiting round and fresh round).
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
