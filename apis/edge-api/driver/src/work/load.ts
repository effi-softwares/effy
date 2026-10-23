// "The van is loaded": every staged drop goes out together, package by package. A package not loaded
// is declared with a reason and held at the hub (`package_hold`); a drop left empty comes off the run.

import { withTransaction } from "@effy/edge-shared";
import { PLANNER_PASS_LOCK, removeAssignment } from "@effy/edge-shared/delivery";
import { accountFor, countByPackage, expectedParcels, recordHandovers, recordReads, writeParcelHolds } from "@effy/edge-shared/labels";
import type { LabelReadDTO, ParcelHandover, ParcelMissing } from "@effy/shared-types";

import { assertRoundOpen } from "./open";
import { assertNothingToHandIn } from "./sequence";
import { NotFoundError } from "./service";

export interface LoadResult {
  /** Moved to out for delivery; their shops are told. */
  loadedDropIds: string[];
  /** Bags declared not loaded, each held. */
  held: number;
  /** Drops removed because none of their packages was loaded. */
  dropsRemoved: number;
}

/** Only staged drops move; nothing moves backwards. Idempotent by state. */
export async function loadRun(
  runId: string,
  driverId: string,
  changeId: string,
  parcels?: ParcelHandover[],
  missingParcels: ParcelMissing[] = [],
  reads?: LabelReadDTO[],
): Promise<LoadResult> {
  return withTransaction(async (tx: any) => {
    // Changes driver work outside a planning pass, so the planner lock comes first (driver-work.ts).
    if (missingParcels.length > 0) await tx.query(PLANNER_PASS_LOCK);

    const round = await tx.query(
      `SELECT id, status FROM public.driver_round WHERE id = $1 AND driver_id = $2 AND kind = 'delivery' FOR UPDATE`,
      [runId, driverId],
    );
    if (round.rowCount === 0) throw new NotFoundError();

    await assertRoundOpen(tx, runId);

    // A retry: nothing left staged; answer with what this changeId did.
    const pending = await tx.query(
      `SELECT 1 FROM public.round_stop WHERE round_id = $1 AND kind = 'customer_drop' AND status = 'pending' LIMIT 1`,
      [runId],
    );
    if (pending.rowCount === 0) {
      const prior = await tx.query(`SELECT count(*)::int AS n FROM public.package_hold WHERE change_id = $1`, [changeId]);
      return { loadedDropIds: [], held: Number(prior.rows[0]?.n ?? 0), dropsRemoved: 0 };
    }

    // The van holds nothing else: collected parcels checked in, failed parcels returned.
    await assertNothingToHandIn(tx, driverId, runId);

    // Packages still to load, in the states the proof path delivers.
    const staged = await tx.query(
      `SELECT rp.id AS row_id, rp.stop_id, rp.shop_fulfillment_id
         FROM public.round_package rp
         JOIN public.round_stop rs ON rs.id = rp.stop_id
        WHERE rs.round_id = $1 AND rs.kind = 'customer_drop' AND rs.status = 'pending'
          AND rp.state IN ('assigned', 'picked_up')`,
      [runId],
    );

    type Staged = { row_id: string; stop_id: string; shop_fulfillment_id: string };
    const byId = new Map<string, Staged>();
    const touchedStops = new Set<string>();
    for (const r of staged.rows) byId.set(r.shop_fulfillment_id, r);

    // Every bag is loaded or declared missing. Some missing: held, package goes. All missing: held, off the run.
    const expected = await expectedParcels(tx, { step: "load", packageIds: [...byId.keys()], roundId: runId });
    const accounted = accountFor("load", expected, parcels, missingParcels);
    const holds = await writeParcelHolds(tx, {
      step: "load", driverId, roundId: runId, changeId, missing: accounted.missing, expectedCount: countByPackage(expected),
    });
    const held = holds.parcelsHeld;
    for (const packageId of holds.packagesHeld) {
      const row = byId.get(packageId);
      if (!row) continue;
      await removeAssignment(tx, { id: row.row_id, stop_id: row.stop_id, round_id: runId, round_status: round.rows[0].status });
      touchedStops.add(row.stop_id);
      byId.delete(packageId);
    }
    let dropsRemoved = 0;
    if (touchedStops.size > 0) {
      const left = await tx.query(`SELECT id FROM public.round_stop WHERE id = ANY($1::uuid[])`, [[...touchedStops]]);
      dropsRemoved = touchedStops.size - (left.rowCount ?? 0);
    }

    const moved = await tx.query(
      `UPDATE public.round_stop
          SET status = 'out_for_delivery'
        WHERE round_id = $1 AND kind = 'customer_drop' AND status = 'pending'
        RETURNING id`,
      [runId],
    );
    if (moved.rowCount > 0) {
      await tx.query(
        `UPDATE public.driver_round SET status = 'in_progress', updated_at = now() WHERE id = $1 AND status = 'planned'`,
        [runId],
      );
    }

    await recordHandovers(tx, {
      step: "load",
      actor: { kind: "driver", driverId },
      roundId: runId,
      changeId,
      parcels: accounted.handed.filter((h) => byId.has(h.parcel.packageId)).map((h) => ({ parcelId: h.parcel.parcelId, method: h.method })),
      allowed: new Map(expected.map((p) => [p.parcelId, p.packageId])),
    });
    await recordReads(tx, { actor: { kind: "driver", driverId }, surface: "driver_app", step: "load", roundId: runId, reads });

    return { loadedDropIds: moved.rows.map((r: any) => r.id as string), held, dropsRemoved };
  });
}
