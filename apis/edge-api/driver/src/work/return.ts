// Returning a run's failed parcels to the hub (088). The write itself is the shared
// `recordParcelReturn`; this is the driver's side of it — scoped to the caller, and gated on the
// round having opened like every other action on a round (072).

import { withTransaction } from "@effy/edge-shared";
import { recordParcelReturn, type ParcelReturnResult } from "@effy/edge-shared/delivery";

import type { PackageHandover } from "@effy/shared-types";

import { recordHandovers } from "./handover";
import { assertRoundOpen } from "./open";

export async function returnParcels(
  runId: string,
  driverId: string,
  driverSub: string,
  changeId: string,
  /** 090 — how each parcel was handed back; optional. */
  packages?: PackageHandover[],
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
    if (!r.replayed && r.returned > 0) {
      await assertRoundOpen(tx, runId);
      const back = await tx.query(
        `SELECT rp.shop_fulfillment_id FROM public.round_package rp
           JOIN public.parcel_return pr ON pr.id = rp.return_id
          WHERE pr.change_id = $1`,
        [changeId],
      );
      await recordHandovers(tx, {
        step: "return", roundId: runId, driverId, changeId, packages,
        allowed: new Set(back.rows.map((x: any) => x.shop_fulfillment_id as string)),
      });
    }
    return r;
  });
}
