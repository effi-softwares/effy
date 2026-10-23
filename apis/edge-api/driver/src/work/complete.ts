// Completing a stop, and checking in at the hub (063, US2; per bag since 096).
//
// ⚠ EVERY WRITE HERE IS IDEMPOTENT ON `changeId`. A driver is on a phone in a loading bay; a request
// that arrives without its response reaching them is ordinary, and the retry must not apply twice
// (027's changeId-per-action rule). "Simplify the request shape" was never licence to drop that.
//
// ⚠ 096 — EVERY BAG IS ACCOUNTED FOR, AND THE SERVER CHECKS. Each step asks `expectedParcels` what it
// still needs and refuses (409 `parcels_unaccounted`) a request that leaves a live bag neither handed
// over nor declared missing. Until 096 a package was one scan, so a second bag left on the counter
// could not be noticed by anyone.

import { bagsToCheckIn, closeRunCheckin, collectedPackages } from "@effy/edge-shared/delivery";
import { query, withTransaction } from "@effy/edge-shared";
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
 * Collect a shop's packages (FR-026).
 *
 * ⚠ THE FULFILLMENT STATUS WRITE BELOW IS LOAD-BEARING, AND A CONTAINER TEST EXISTS BECAUSE OF IT.
 * The wave planner's gather query excludes a package by `shop_fulfillment.status <> 'ready_for_pickup'`
 * — the partial unique index only excludes rows still `assigned`. So if this stops advancing the
 * status, EVERY subsequent wave re-collects packages already sitting in a driver's van, and nothing
 * anywhere fails. `planner.container.test.ts` pins it directly.
 *
 * ⚠ A PACKAGE NOT TAKEN IS RECORDED, NEVER OMITTED.
 *
 * ⚠ 093 — ONLY WHAT THE DRIVER NAMED IS SETTLED. A package not named stays `assigned`, the stop stays
 * open, and `remaining` tells the app to show it.
 *
 * ⚠ 096 — PER BAG. A package collected must have every live bag scanned, typed, ticked or declared
 * missing. Some bags missing: each is held and the package is collected. Every bag missing: the shop
 * does not have it — the package is "not available", exactly as if the driver had said so.
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

    // ⚠ Idempotent by state, not by a dedupe table: a stop already `done` has nothing left to do.
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

    // 096 — every bag of every package the driver is taking.
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
        // ⚠ See the note above — without this the planner collects it again, forever.
        await tx.query(
          `UPDATE public.shop_fulfillment
              SET status = 'collected', state_changed_at = now()
            WHERE id = $1 AND status = 'ready_for_pickup'`,
          [r.shop_fulfillment_id],
        );
      } else {
        notAvailable += 1;
        // ⚠ The package stays `ready_for_pickup` ON PURPOSE: a later wave should try again.
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

    // 096 — bags missing from a package that is still collected are held, one by one.
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
 * Hub check-in (FR-022, FR-023; per bag since 096).
 *
 * ⚠ THE SPLIT IS SHOWN, NEVER DECIDED (079, 082) — `closeRunCheckin` reads who delivers each parcel.
 *
 * ⚠ 096 — the bags the driver hands in are those hub staff have not already checked in at the hub
 * station (`bagsToCheckIn`); a bag not in the van is declared, never assumed. Every bag of a package
 * missing holds the package (093's shape); some missing holds those bags and the package arrives.
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
      // 093 — check-in closes the run, so every shop on it must be settled first.
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
      // A retry: the run was checked in (by this driver, or at the hub station) — answer as checked in.
      const prior = await tx.query(`SELECT count(*)::int AS n FROM public.package_hold WHERE change_id = $1`, [body.changeId]);
      held = Number(prior.rows[0]?.n ?? 0);
    }
    await recordReads(tx, { actor: { kind: "driver", driverId }, surface: "driver_app", step: "checkin", roundId: runId, reads: body.reads });
    const out = await closeRunCheckin(tx, runId, { by: "driver" });
    return { ...out, held };
  });
}

export { collectedPackages };

