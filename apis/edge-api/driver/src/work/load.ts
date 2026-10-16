// "The van is loaded" (090, driver backlog H8): every staged drop on a delivery run goes out for
// delivery together — what actually happens at the hub, once per run, instead of "Start this drop" per
// drop. The load scan (S3) completes this; "Mark all loaded" is its fallback.

import { withTransaction } from "@effy/edge-shared";
import type { PackageHandover } from "@effy/shared-types";

import { recordHandovers } from "./handover";
import { assertRoundOpen } from "./open";
import { NotFoundError } from "./service";

export interface LoadResult {
  /** The drops this call moved to out for delivery — the ones whose shops are told. */
  loadedDropIds: string[];
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
): Promise<LoadResult> {
  return withTransaction(async (tx: any) => {
    const round = await tx.query(
      `SELECT id FROM public.driver_round WHERE id = $1 AND driver_id = $2 AND kind = 'delivery' FOR UPDATE`,
      [runId, driverId],
    );
    if (round.rowCount === 0) throw new NotFoundError();

    // 072 — the van does not leave before the round opens.
    await assertRoundOpen(tx, runId);

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

    const onRun = await tx.query(
      `SELECT rp.shop_fulfillment_id FROM public.round_package rp
         JOIN public.round_stop rs ON rs.id = rp.stop_id
        WHERE rs.round_id = $1 AND rp.state = 'assigned'`,
      [runId],
    );
    await recordHandovers(tx, {
      step: "load", roundId: runId, driverId, changeId, packages,
      allowed: new Set(onRun.rows.map((r: any) => r.shop_fulfillment_id as string)),
    });

    return { loadedDropIds: moved.rows.map((r: any) => r.id as string) };
  });
}
