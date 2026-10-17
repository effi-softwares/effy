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
import type { MissingReason, NotLoadedPackage, PackageHandover } from "@effy/shared-types";

import { recordHandovers } from "./handover";
import { assertRoundOpen } from "./open";
import { assertNothingToHandIn } from "./sequence";
import { NotFoundError } from "./service";

export const MISSING_REASONS: ReadonlySet<MissingReason> = new Set(["not_at_hub", "damaged", "wrong_temperature", "other"]);

export interface LoadResult {
  /** The drops this call moved to out for delivery — the ones whose shops are told. */
  loadedDropIds: string[];
  /** 093 — packages taken off the run as not loaded. */
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
  packages?: PackageHandover[],
  notLoaded: NotLoadedPackage[] = [],
): Promise<LoadResult> {
  return withTransaction(async (tx: any) => {
    // Taking packages off the run changes driver work outside a planning pass: wait for a pass, never
    // race one — the lock comes before any row lock (driver-work.ts).
    if (notLoaded.length > 0) await tx.query(PLANNER_PASS_LOCK);

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
      `SELECT rp.id AS row_id, rp.stop_id, rp.shop_fulfillment_id, sf.package_code
         FROM public.round_package rp
         JOIN public.round_stop rs ON rs.id = rp.stop_id
         JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
        WHERE rs.round_id = $1 AND rs.kind = 'customer_drop' AND rs.status = 'pending'
          AND rp.state IN ('assigned', 'picked_up')`,
      [runId],
    );

    // ── Packages not loaded ──────────────────────────────────────────────────────────────────────
    type Staged = { row_id: string; stop_id: string; shop_fulfillment_id: string };
    const byId = new Map<string, Staged>();
    const byCode = new Map<string, Staged>();
    const touchedStops = new Set<string>();
    for (const r of staged.rows) {
      byId.set(r.shop_fulfillment_id, r);
      if (r.package_code) byCode.set(String(r.package_code).toUpperCase(), r);
    }
    let held = 0;
    for (const n of notLoaded) {
      const row = (n.packageId ? byId.get(n.packageId) : undefined)
        ?? (n.packageCode ? byCode.get(n.packageCode.toUpperCase()) : undefined);
      if (!row) continue; // not on this run, or already off it
      await tx.query(
        `INSERT INTO public.package_hold (shop_fulfillment_id, step, reason, note, driver_id, round_id, change_id)
         VALUES ($1, 'load', $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [row.shop_fulfillment_id, n.reason, n.note?.trim() || null, driverId, runId, changeId],
      );
      // Off the run: it is still at the hub (or nowhere), not in the van. The one writer for taking a
      // package off a round also removes a drop left empty, and a run left with nothing.
      await removeAssignment(tx, { id: row.row_id, stop_id: row.stop_id, round_id: runId, round_status: round.rows[0].status });
      touchedStops.add(row.stop_id);
      byId.delete(row.shop_fulfillment_id);
      held += 1;
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
      step: "load", roundId: runId, driverId, changeId, packages,
      allowed: new Set(byId.keys()),
    });

    return { loadedDropIds: moved.rows.map((r: any) => r.id as string), held, dropsRemoved };
  });
}
