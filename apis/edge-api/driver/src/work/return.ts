// Returning a run's failed parcels to the hub (088). The write itself is the shared
// `recordParcelReturn`; this is the driver's side of it — scoped to the caller, and gated on the
// round having opened like every other action on a round (072).

import { withTransaction } from "@effy/edge-shared";
import { recordParcelReturn, type ParcelReturnResult } from "@effy/edge-shared/delivery";

import { assertRoundOpen } from "./open";

export async function returnParcels(
  runId: string,
  driverId: string,
  driverSub: string,
  changeId: string,
): Promise<ParcelReturnResult> {
  return withTransaction(async (tx: any) => {
    const r = await recordParcelReturn(tx, {
      roundId: runId,
      driverId,
      recordedBy: "driver",
      recordedBySub: driverSub,
      changeId,
    });
    // After the ownership check inside the writer, so somebody else's round still answers "not
    // found"; a replay was answered before this could refuse it. Rolls the return back if refused.
    if (!r.replayed && r.returned > 0) await assertRoundOpen(tx, runId);
    return r;
  });
}
