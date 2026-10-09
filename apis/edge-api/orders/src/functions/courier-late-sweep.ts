// Scheduled (every 30 minutes) — how many courier parcels are late, and where (080 US5).
//
// ⚠ THE BLIND SPOT COURIER DELIVERY ADDS. A parcel that misses its courier's pickup — at the hub, or
// at a supplier the courier never reached — fails nothing: no error, no red test. The Courier tab
// shows it to whoever looks; this is for when nobody does. It emits one count per place, ZERO
// included, so "no data" always means this function has stopped (the alarm treats it as breaching).
import { emitMetric, logger } from "@effy/edge-shared";

import { courierLateCounts } from "../orders/service";

export const NAMESPACE = "Effy/Orders";

export const handler = async (): Promise<void> => {
  const late = await courierLateCounts();
  // ⚠ Bounded dimension values only: hub | supplier | courier.
  for (const where of ["hub", "supplier", "courier"] as const) {
    emitMetric(NAMESPACE, "CourierParcelsLate", late[where], { where });
  }
  logger.info({ late }, "courier late sweep");
};
