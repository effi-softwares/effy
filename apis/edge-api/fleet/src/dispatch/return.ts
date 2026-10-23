// Staff record that a driver's failed parcels are back: the driver's own `recordParcelReturn`, with an audit row.

import { withTransaction } from "@effy/edge-shared";
import { recordParcelReturn, type ParcelReturnResult } from "@effy/edge-shared/delivery";

import { recordAudit } from "../shared/audit";

export async function staffReturnParcels(roundId: string, actorSub: string, changeId: string): Promise<ParcelReturnResult> {
  return withTransaction(async (tx: any) => {
    const r = await recordParcelReturn(tx, { roundId, recordedBy: "staff", recordedBySub: actorSub, changeId });
    if (!r.replayed && r.returned > 0) {
      await recordAudit(
        { actorSub, action: "dispatch.parcels_returned", targetType: "driver_round", driverId: r.driverId, detail: { roundId, parcels: r.returned } },
        tx,
      );
    }
    return r;
  });
}
