// A run's stage facts, one fragment for the driver service and dispatch; the words are `runStage` in @effy/shared-types.

import { runStage, type RunStage } from "@effy/shared-types";

import { TO_RETURN_SQL } from "./parcel-return";

/** `LEFT JOIN LATERAL … stage_facts ON TRUE` for round `dr`, adding shops_total, shops_settled, checked_in, drops_total, drops_pending, drops_finished, to_return. */
export const ROUND_STAGE_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE sx.kind = 'shop_pickup')::int                                     AS shops_total,
           count(*) FILTER (WHERE sx.kind = 'shop_pickup' AND sx.status IN ('done', 'skipped'))::int AS shops_settled,
           EXISTS (SELECT 1 FROM public.hub_checkin hc WHERE hc.round_id = dr.id)                   AS checked_in,
           count(*) FILTER (WHERE sx.kind = 'customer_drop')::int                                   AS drops_total,
           count(*) FILTER (WHERE sx.kind = 'customer_drop' AND sx.status = 'pending')::int         AS drops_pending,
           count(*) FILTER (WHERE sx.kind = 'customer_drop' AND sx.status IN ('done', 'skipped'))::int AS drops_finished,
           (SELECT count(*) FROM public.round_package rp
              JOIN public.round_stop rs ON rs.id = rp.stop_id
             WHERE rs.round_id = dr.id AND ${TO_RETURN_SQL})::int                                    AS to_return
      FROM public.round_stop sx
     WHERE sx.round_id = dr.id
  ) stage_facts ON TRUE`;

export const ROUND_STAGE_COLUMNS = `
  stage_facts.shops_total, stage_facts.shops_settled, stage_facts.checked_in,
  stage_facts.drops_total, stage_facts.drops_pending, stage_facts.drops_finished, stage_facts.to_return`;

export interface RoundStageRow {
  shops_total: number | string | null;
  shops_settled: number | string | null;
  checked_in: boolean | null;
  drops_total: number | string | null;
  drops_pending: number | string | null;
  drops_finished: number | string | null;
  to_return: number | string | null;
}

export function stageOfRound(kind: string, status: string, r: RoundStageRow): { stage: RunStage; label: string } {
  return runStage({
    kind: kind === "collection" ? "collection" : "delivery",
    status,
    shopsTotal: Number(r.shops_total ?? 0),
    shopsSettled: Number(r.shops_settled ?? 0),
    checkedIn: r.checked_in === true,
    dropsTotal: Number(r.drops_total ?? 0),
    dropsPending: Number(r.drops_pending ?? 0),
    dropsFinished: Number(r.drops_finished ?? 0),
    toReturn: Number(r.to_return ?? 0),
  });
}

/** Null when there is no such round. */
export async function readRoundStage(
  db: { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }> },
  roundId: string,
): Promise<{ stage: RunStage; label: string } | null> {
  const res = await db.query(
    `SELECT dr.kind, dr.status, ${ROUND_STAGE_COLUMNS}
       FROM public.driver_round dr
       ${ROUND_STAGE_LATERAL}
      WHERE dr.id = $1`,
    [roundId],
  );
  const r = res.rows[0] as (RoundStageRow & { kind: string; status: string }) | undefined;
  return r ? stageOfRound(r.kind, r.status, r) : null;
}
