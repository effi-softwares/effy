// Returning a run's failed parcels to the hub (088; per bag since 096). The write itself is the shared
// `recordParcelReturn`; this is the driver's side of it — scoped to the caller, gated on the round
// having opened like every other action on a round (072), and accounting for every bag (096).

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
  /** 096 — every bag handed back, or declared missing, and the reads made at the hub. */
  body: Pick<ParcelReturnRequest, "parcels" | "missingParcels" | "reads"> = {},
): Promise<ParcelReturnResult> {
  return withTransaction(async (tx: any) => {
    // The bags the round has to bring back, read before the return moves them.
    const due = await toReturnOnRound(tx, runId);
    const packageIds = due?.packageIds ?? [];

    const r = await recordParcelReturn(tx, {
      roundId: runId,
      driverId,
      recordedBy: "driver",
      recordedBySub: driverSub,
      changeId,
    });
    // After the ownership check inside the writer, so somebody else's round still answers "not
    // found"; a replay was answered before this could refuse it. Rolls the return back if refused.
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
