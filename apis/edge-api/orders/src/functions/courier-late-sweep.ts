// Counts late courier parcels per place, zero included, so "no data" means this function stopped.
import { emitMetric, logger } from "@effy/edge-shared";

import { courierLateCounts } from "../orders/service";

export const NAMESPACE = "Effy/Orders";

export const handler = async (): Promise<void> => {
  const late = await courierLateCounts();
  // Bounded values only: hub | supplier | courier.
  for (const where of ["hub", "supplier", "courier"] as const) {
    emitMetric(NAMESPACE, "CourierParcelsLate", late[where], { where });
  }
  logger.info({ late }, "courier late sweep");
};
