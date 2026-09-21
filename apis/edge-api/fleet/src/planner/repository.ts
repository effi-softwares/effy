// The planner's data layer (063). Raw parameterised SQL; rows are mapped to domain here and the row
// shapes never escape (Principle VI).

import { query, withTransaction, type CollectionRun } from "@effy/edge-shared";

import {
  CANDIDATE_DRIVERS,
  COLLECTION_SCHEDULE,
  GATHER_COLLECTION,
  GATHER_DELIVERY,
  OPEN_STOP_FOR_SHOP,
  PLANNER_SETTINGS,
} from "./sql";
import type { PlannablePackage, PlannerCandidate, PlannerSettings, WavePlan } from "./types";

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
  };
}

export async function gatherCollectionWork(): Promise<PlannablePackage[]> {
  const res = await query<GatherRow>(GATHER_COLLECTION);
  return res.rows.map(mapPackage);
}

export async function gatherDeliveryWork(): Promise<PlannablePackage[]> {
  const res = await query<GatherRow>(GATHER_DELIVERY);
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

export async function loadCandidates(): Promise<PlannerCandidate[]> {
  const res = await query<CandidateRow>(CANDIDATE_DRIVERS);
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

export async function loadSchedule(): Promise<{ runs: CollectionRun[]; settings: PlannerSettings }> {
  const [runsRes, setRes] = await Promise.all([
    query<{ hour: number; minute: number }>(COLLECTION_SCHEDULE),
    query<{ sameday_prep_buffer_min: number; planning_lead_min: number; per_stop_allowance_min: number }>(
      PLANNER_SETTINGS,
    ),
  ]);
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

/** A collection round already under way with this shop's stop still outstanding (FR-004a). */
export async function findOpenStopForShop(shopId: string): Promise<{
  stopId: string;
  roundId: string;
  driverId: string;
  deadlineAt: Date;
  locked: boolean;
} | null> {
  const res = await query<{
    stop_id: string;
    round_id: string;
    driver_id: string;
    deadline_at: Date;
    locked_by_sub: string | null;
  }>(OPEN_STOP_FOR_SHOP, [shopId]);
  const r = res.rows[0];
  return r
    ? {
        stopId: r.stop_id,
        roundId: r.round_id,
        driverId: r.driver_id,
        deadlineAt: r.deadline_at,
        locked: r.locked_by_sub !== null,
      }
    : null;
}

/**
 * Write everything one wave decided, in ONE transaction.
 *
 * ⚠ THE PARTIAL UNIQUE INDEX IS WHAT MAKES THIS SAFE, NOT THIS FUNCTION (FR-005, research R6). Two
 * passes can both read the same gather result; only one can win `round_package_open_uq`. A conflict
 * is therefore an ORDINARY OUTCOME meaning "somebody else already assigned it" — not an error — and
 * is swallowed per row with `ON CONFLICT DO NOTHING` rather than failing the whole wave.
 */
export async function commitWave(
  plan: WavePlan,
  trigger: "schedule" | "manual",
  triggeredBySub: string | null,
  runId: string | null,
): Promise<{ waveId: string; assigned: number }> {
  return withTransaction(async (tx: any) => {
    const wave = await tx.query(
      `INSERT INTO public.dispatch_wave
         (run_id, kind, planned_for, trigger, triggered_by_sub, packages_considered)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [runId, plan.kind, plan.plannedFor, trigger, triggeredBySub, plan.considered],
    );
    const waveId: string = wave.rows[0].id;
    let assigned = 0;

    for (const [driverId, packages] of plan.assignments) {
      const round = await tx.query(
        `INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [waveId, driverId, plan.kind, plan.deadlineAt],
      );
      const roundId: string = round.rows[0].id;

      // One stop per shop (collection) or per order (delivery) — which is what keeps same-shop
      // packages adjacent by construction rather than by sorting (FR-019).
      const groups = new Map<string, typeof packages>();
      for (const p of packages) {
        const key = plan.kind === "collection" ? p.shopId : (p.orderId ?? p.packageId);
        const g = groups.get(key);
        if (g) g.push(p);
        else groups.set(key, [p]);
      }

      for (const group of groups.values()) {
        const head = group[0]!;
        const stop = await tx.query(
          `INSERT INTO public.round_stop (round_id, kind, shop_id, order_id, zone_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [
            roundId,
            plan.kind === "collection" ? "shop_pickup" : "customer_drop",
            plan.kind === "collection" ? head.shopId : null,
            plan.kind === "collection" ? null : head.orderId,
            head.zoneId,
          ],
        );
        for (const p of group) {
          const ins = await tx.query(
            `INSERT INTO public.round_package (stop_id, shop_fulfillment_id)
             VALUES ($1, $2)
             ON CONFLICT (shop_fulfillment_id) WHERE state = 'assigned' DO NOTHING
             RETURNING id`,
            [stop.rows[0].id, p.packageId],
          );
          if (ins.rowCount && ins.rowCount > 0) assigned += 1;
        }
      }

      // ⚠ 064 — A COLLECTION ROUND ENDS AT THE HUB, AND THAT ENDING IS NOW A STOP.
      //
      // `round_stop_kind_check` has permitted `'hub_checkin'` since 063 and nothing ever created one.
      // The consequence was found live on 2026-09-21: `todayView`'s outstanding filter keeps only
      // `pending`/`arrived` stops, so the moment the last shop stop went `done` the driver's home
      // screen had nothing left — and BOTH routes into the round (the hero card, drawn from `active`,
      // and the "Whole run" link, drawn only when the queue is non-empty) disappeared together. A
      // driver was left holding thirteen packages with no way back into their own round, which is
      // 056's stranded-work shape arriving through the UI instead of the database.
      //
      // ⚠ It carries NEITHER a shop nor an order — the same CHECK requires both to be NULL for this
      // kind, which is exactly why `collectionRun`'s projection has to exclude it (it maps stops onto
      // `CollectionStopSummary`, which needs a shop name and code).
      //
      // A delivery round has no equivalent: it ends at the last customer, not back at the hub.
      if (plan.kind === "collection") {
        await tx.query(
          `INSERT INTO public.round_stop (round_id, kind) VALUES ($1, 'hub_checkin')`,
          [roundId],
        );
      }
    }

    // FR-004a — packages joining a round already under way.
    for (const [stopId, packages] of plan.lateJoins) {
      for (const p of packages) {
        const ins = await tx.query(
          `INSERT INTO public.round_package (stop_id, shop_fulfillment_id)
           VALUES ($1, $2)
           ON CONFLICT (shop_fulfillment_id) WHERE state = 'assigned' DO NOTHING
           RETURNING id`,
          [stopId, p.packageId],
        );
        if (ins.rowCount && ins.rowCount > 0) {
          assigned += 1;
          // ⚠ FR-004b — the driver must be TOLD the round changed. A round that grows silently
          // underneath somebody working it is worse than one that never grows.
          await tx.query(
            `UPDATE public.driver_round
                SET changed_note = COALESCE(changed_note || ' ', '') || $2,
                    updated_at = now()
              WHERE id = (SELECT round_id FROM public.round_stop WHERE id = $1)`,
            [stopId, `Added ${p.orderNumber} at ${p.shopName}.`],
          );
        }
      }
    }

    // ⚠ Exclusions are written PER WAVE and replaced when a wave re-runs — a reason from last
    // Tuesday is not a fact about today (data-model.md).
    for (const e of plan.exclusions) {
      await tx.query(
        `INSERT INTO public.assignment_exclusion (wave_id, shop_fulfillment_id, driver_id, reason)
         VALUES ($1, $2, $3, $4)`,
        [waveId, e.packageId, e.driverId, e.reason],
      );
    }

    await tx.query(
      `UPDATE public.dispatch_wave
          SET finished_at = now(), packages_assigned = $2, packages_unassigned = $3
        WHERE id = $1`,
      [waveId, assigned, plan.considered - assigned],
    );
    return { waveId, assigned };
  });
}
