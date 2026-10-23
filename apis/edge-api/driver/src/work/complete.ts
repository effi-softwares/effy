// Every write is idempotent on `changeId`. Every live bag must be handed over or declared missing,
// checked against `expectedParcels` (409 `parcels_unaccounted`).

import { bagsToCheckIn, closeRunCheckin, collectedPackages } from "@effy/edge-shared/delivery";
import { withTransaction } from "@effy/edge-shared";
import { accountFor, countByPackage, expectedParcels, recordHandovers, recordReads, writeParcelHolds } from "@effy/edge-shared/labels";
import type { CollectRequest, HubCheckinRequest, HubCheckinResponse } from "@effy/shared-types";

import { assertRoundOpen } from "./open";
import { assertNoDeliveriesOpen, assertStopsSettled } from "./sequence";
import { NotFoundError } from "./service";

export class ConflictError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "ConflictError";
  }
}

/**
 * Advancing the fulfilment status is what keeps the planner from re-collecting packages already in a
 * van (`planner.container.test.ts`). A package not taken is recorded, never omitted; only what the
 * driver named is settled. Some bags missing: held, package collected. All missing: "not available".
 */
export async function collectStop(
  runId: string,
  stopId: string,
  driverId: string,
  body: CollectRequest,
): Promise<{ collected: number; notAvailable: number; remaining: number }> {
  return withTransaction(async (tx: any) => {
    const stop = await tx.query(
      `SELECT rs.id, rs.status
         FROM public.round_stop rs
         JOIN public.driver_round dr ON dr.id = rs.round_id
        WHERE rs.id = $1 AND rs.round_id = $2 AND dr.driver_id = $3
        FOR UPDATE OF rs`,
      [stopId, runId, driverId],
    );
    if (stop.rowCount === 0) throw new NotFoundError();

    // Idempotent by state: a `done` stop has nothing left to do.
    if (stop.rows[0].status === "done") {
      const prior = await tx.query(
        `SELECT state, count(*)::int AS n FROM public.round_package WHERE stop_id = $1 GROUP BY state`,
        [stopId],
      );
      const by = (s: string) => Number(prior.rows.find((r: any) => r.state === s)?.n ?? 0);
      return { collected: by("picked_up"), notAvailable: by("not_available"), remaining: 0 };
    }

    await assertRoundOpen(tx, runId);
    await assertNoDeliveriesOpen(tx, driverId, runId);

    const rows = await tx.query(
      `SELECT id, shop_fulfillment_id FROM public.round_package WHERE stop_id = $1 AND state = 'assigned'`,
      [stopId],
    );

    const declared = new Map((body.packages ?? []).map((p) => [p.packageId, p]));
    const named = (rows.rows as Array<{ id: string; shop_fulfillment_id: string }>).filter((r) => declared.has(r.shop_fulfillment_id));

    const taking = named.filter((r) => declared.get(r.shop_fulfillment_id)!.outcome === "picked_up").map((r) => r.shop_fulfillment_id);
    const expected = await expectedParcels(tx, { step: "collect", packageIds: taking, roundId: runId });
    const accounted = accountFor("collect", expected, body.parcels, body.missingParcels);
    const expectedPer = countByPackage(expected);
    const missingPer = countByPackage(accounted.missing.map((m) => m.parcel));
    const noBags = new Set([...missingPer].filter(([id, n]) => n >= (expectedPer.get(id) ?? Infinity)).map(([id]) => id));

    let collected = 0;
    let notAvailable = 0;
    const remaining = rows.rows.length - named.length;

    for (const r of named) {
      const named1 = declared.get(r.shop_fulfillment_id)!;
      const outcome = named1.outcome === "picked_up" && noBags.has(r.shop_fulfillment_id) ? "not_available" : named1.outcome;
      const note = named1.outcome === "picked_up" && outcome === "not_available" ? "No bags at the shop." : (named1.note ?? null);

      await tx.query(`UPDATE public.round_package SET state = $2, settled_at = now() WHERE id = $1`, [r.id, outcome]);

      if (outcome === "picked_up") {
        collected += 1;
        await tx.query(
          `UPDATE public.shop_fulfillment
              SET status = 'collected', state_changed_at = now()
            WHERE id = $1 AND status = 'ready_for_pickup'`,
          [r.shop_fulfillment_id],
        );
      } else {
        notAvailable += 1;
        // Stays `ready_for_pickup` on purpose: a later wave tries again.
        await tx.query(`UPDATE public.round_package SET note = $2 WHERE id = $1`, [r.id, note ?? "Not available at collection."]);
      }
    }

    if (remaining === 0) {
      await tx.query(`UPDATE public.round_stop SET status = 'done', completed_at = now() WHERE id = $1`, [stopId]);
    }
    await tx.query(
      `UPDATE public.driver_round SET status = 'in_progress', updated_at = now() WHERE id = $1 AND status = 'planned'`,
      [runId],
    );

    await writeParcelHolds(tx, {
      step: "collect", driverId, roundId: runId, changeId: body.changeId,
      missing: accounted.missing.filter((m) => !noBags.has(m.parcel.packageId)),
      expectedCount: expectedPer,
    });
    await recordHandovers(tx, {
      step: "collect",
      actor: { kind: "driver", driverId },
      roundId: runId,
      changeId: body.changeId,
      parcels: accounted.handed.filter((h) => !noBags.has(h.parcel.packageId)).map((h) => ({ parcelId: h.parcel.parcelId, method: h.method })),
      allowed: new Map(expected.map((p) => [p.parcelId, p.packageId])),
    });
    await recordReads(tx, { actor: { kind: "driver", driverId }, surface: "driver_app", step: "collect", roundId: runId, reads: body.reads });

    return { collected, notAvailable, remaining };
  });
}

/**
 * The Effy/Courier split is read by `closeRunCheckin`, never decided. The driver hands in the bags hub
 * staff have not already checked in; all of a package's bags missing holds the package.
 */
export async function hubCheckin(
  runId: string,
  driverId: string,
  body: Pick<HubCheckinRequest, "changeId" | "parcels" | "missingParcels" | "reads"> = { changeId: crypto.randomUUID() },
): Promise<HubCheckinResponse> {
  return withTransaction(async (tx: any) => {
    const round = await tx.query(
      `SELECT id FROM public.driver_round WHERE id = $1 AND driver_id = $2 AND kind = 'collection' FOR UPDATE`,
      [runId, driverId],
    );
    if (round.rowCount === 0) throw new NotFoundError();

    await assertRoundOpen(tx, runId);

    const already = await tx.query(`SELECT 1 FROM public.hub_checkin WHERE round_id = $1`, [runId]);
    let held = 0;
    if ((already.rowCount ?? 0) === 0) {
      // Check-in closes the run, so every shop on it must be settled first.
      await assertStopsSettled(tx, runId);
      const expected = await bagsToCheckIn(tx, runId);
      const accounted = accountFor("checkin", expected, body.parcels, body.missingParcels);
      const holds = await writeParcelHolds(tx, {
        step: "checkin", driverId, roundId: runId, changeId: body.changeId, missing: accounted.missing,
        expectedCount: countByPackage(expected),
      });
      held = holds.parcelsHeld;
      await recordHandovers(tx, {
        step: "checkin",
        actor: { kind: "driver", driverId },
        roundId: runId,
        changeId: body.changeId,
        parcels: accounted.handed.map((h) => ({ parcelId: h.parcel.parcelId, method: h.method })),
        allowed: new Map(expected.map((p) => [p.parcelId, p.packageId])),
      });
    } else {
      // A retry: already checked in, by this driver or at the hub station.
      const prior = await tx.query(`SELECT count(*)::int AS n FROM public.package_hold WHERE change_id = $1`, [body.changeId]);
      held = Number(prior.rows[0]?.n ?? 0);
    }
    await recordReads(tx, { actor: { kind: "driver", driverId }, surface: "driver_app", step: "checkin", roundId: runId, reads: body.reads });
    const out = await closeRunCheckin(tx, runId, { by: "driver" });
    return { ...out, held };
  });
}

export { collectedPackages };

