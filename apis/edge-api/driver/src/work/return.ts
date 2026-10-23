// The driver's side of `recordParcelReturn`: scoped to the caller, gated on the round being open, every bag accounted for.

import { withTransaction } from "@effy/edge-shared";
import { recordParcelReturn, toReturnOnRound, type ParcelReturnResult } from "@effy/edge-shared/delivery";
import { accountFor, countByPackage, expectedParcels, recordHandovers, recordReads, writeParcelHolds } from "@effy/edge-shared/labels";
import type { ParcelReturnRequest } from "@effy/shared-types";

import { assertRoundOpen } from "./open";

export async function returnParcels(
  runId: string,
  driverId: string,
  driverSub: string,
  changeId: string,
  /** Every bag handed back or declared missing, and the reads made at the hub. */
  body: Pick<ParcelReturnRequest, "parcels" | "missingParcels" | "reads"> = {},
): Promise<ParcelReturnResult> {
  return withTransaction(async (tx: any) => {
    // Read before the return moves them.
    const due = await toReturnOnRound(tx, runId);
    const packageIds = due?.packageIds ?? [];

    const r = await recordParcelReturn(tx, {
      roundId: runId,
      driverId,
      recordedBy: "driver",
      recordedBySub: driverSub,
      changeId,
    });
    // After the writer's ownership check, so another's round still answers "not found". Rolls back if refused.
    if (!r.replayed && r.returned > 0) {
      await assertRoundOpen(tx, runId);
      const expected = await expectedParcels(tx, { step: "return", packageIds, roundId: runId });
      const accounted = accountFor("return", expected, body.parcels, body.missingParcels);
      await writeParcelHolds(tx, {
        step: "return", driverId, roundId: runId, changeId, missing: accounted.missing, expectedCount: countByPackage(expected),
      });
      await recordHandovers(tx, {
        step: "return",
        actor: { kind: "driver", driverId },
        roundId: runId,
        changeId,
        parcels: accounted.handed.map((h) => ({ parcelId: h.parcel.parcelId, method: h.method })),
        allowed: new Map(expected.map((p) => [p.parcelId, p.packageId])),
      });
      await recordReads(tx, { actor: { kind: "driver", driverId }, surface: "driver_app", step: "return", roundId: runId, reads: body.reads });
    }
    return r;
  });
}
