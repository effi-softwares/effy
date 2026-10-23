// "The van is loaded" (090, driver backlog H8): every staged drop on a delivery run goes out for
// delivery together — what actually happens at the hub, once per run. The load scan (S3) completes
// this; "Mark all loaded" is its fallback.
//
// ⚠ 093 — LOADING IS THE ONLY WAY A DROP GOES OUT FOR DELIVERY, and it is accounted package by package.
// A package the driver could not load is declared with a reason: it comes off the run and is held at the
// hub for a dispatcher (`package_hold`), and a drop left with nothing comes off the run with it. Nothing
// is "out for delivery" that was never in the van.

import { withTransaction } from "@effy/edge-shared";
import { PLANNER_PASS_LOCK, removeAssignment } from "@effy/edge-shared/delivery";
import { accountFor, countByPackage, expectedParcels, recordHandovers, recordReads, writeParcelHolds } from "@effy/edge-shared/labels";
import type { LabelReadDTO, MissingReason, ParcelHandover, ParcelMissing } from "@effy/shared-types";

import { assertRoundOpen } from "./open";
import { assertNothingToHandIn } from "./sequence";
import { NotFoundError } from "./service";

export interface LoadResult {
  /** The drops this call moved to out for delivery — the ones whose shops are told. */
  loadedDropIds: string[];
  /** 093/096 — bags declared not loaded (each held; a package whose every bag is missing comes off the run). */
  held: number;
  /** 093 — drops removed because none of their packages was loaded. */
  dropsRemoved: number;
}

/**
 * ⚠ ONLY STAGED DROPS MOVE. A drop the driver already started, is on the way to, or has arrived at
 * keeps its state — never moved backwards (backlog A3) — and a delivered or failed one is finished.
 * Idempotent by state: a second load finds nothing staged and moves nothing.
 */
export async function loadRun(
  runId: string,
  driverId: string,
  changeId: string,
  parcels?: ParcelHandover[],
  missingParcels: ParcelMissing[] = [],
  reads?: LabelReadDTO[],
): Promise<LoadResult> {
  return withTransaction(async (tx: any) => {
    // Taking packages off the run changes driver work outside a planning pass: wait for a pass, never
    // race one — the lock comes before any row lock (driver-work.ts).
    if (missingParcels.length > 0) await tx.query(PLANNER_PASS_LOCK);

    const round = await tx.query(
      `SELECT id, status FROM public.driver_round WHERE id = $1 AND driver_id = $2 AND kind = 'delivery' FOR UPDATE`,
      [runId, driverId],
    );
    if (round.rowCount === 0) throw new NotFoundError();

    // 072 — the van does not leave before the round opens.
    await assertRoundOpen(tx, runId);

    // A retry: no drop left staged. It answers with what this changeId already did.
    const pending = await tx.query(
      `SELECT 1 FROM public.round_stop WHERE round_id = $1 AND kind = 'customer_drop' AND status = 'pending' LIMIT 1`,
      [runId],
    );
    if (pending.rowCount === 0) {
      const prior = await tx.query(`SELECT count(*)::int AS n FROM public.package_hold WHERE change_id = $1`, [changeId]);
      return { loadedDropIds: [], held: Number(prior.rows[0]?.n ?? 0), dropsRemoved: 0 };
    }

    // 093 — the van holds nothing else: collected parcels checked in, failed parcels returned.
    await assertNothingToHandIn(tx, driverId, runId);

    // The packages still to load, on the staged drops — the states the proof path delivers (proof/sql.ts).
    const staged = await tx.query(
      `SELECT rp.id AS row_id, rp.stop_id, rp.shop_fulfillment_id
         FROM public.round_package rp
         JOIN public.round_stop rs ON rs.id = rp.stop_id
        WHERE rs.round_id = $1 AND rs.kind = 'customer_drop' AND rs.status = 'pending'
          AND rp.state IN ('assigned', 'picked_up')`,
      [runId],
    );

    // ── Packages not loaded ──────────────────────────────────────────────────────────────────────
    type Staged = { row_id: string; stop_id: string; shop_fulfillment_id: string };
    const byId = new Map<string, Staged>();
    const touchedStops = new Set<string>();
    for (const r of staged.rows) byId.set(r.shop_fulfillment_id, r);

    // 096 — every bag of every staged package is loaded, or declared missing with a reason. Some bags
    // missing: each is held and the package goes out. Every bag missing: the package is held and comes
    // off the run (093's shape), and a drop left with nothing comes off too.
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
