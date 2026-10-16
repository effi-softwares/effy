// A staff member records that a driver's failed parcels are back at the hub (088, Story 4). The write
// is the shared `recordParcelReturn` — the same one the driver's app calls — with the staff member as
// the one who recorded it, and an audit row.

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
