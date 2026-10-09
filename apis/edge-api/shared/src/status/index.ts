// 073 — where a package is, derived once and read by every service that shows it.

import type { PackageStatusView } from "@effy/shared-types";

import type { Queryable } from "../lib/db";
import { PACKAGE_STATUS_FACTS, type PackageStatusFactsRow } from "./sql";
import { forShop, packageStatus, type PackageFacts } from "./status";

export { forShop, packageStatus, type PackageFacts } from "./status";
export { PACKAGE_STATUS_FACTS, type PackageStatusFactsRow } from "./sql";
export { reasonSeverity, reasonWords, type ReasonSeverity } from "./severity";

export function factsOf(r: PackageStatusFactsRow): PackageFacts {
  return {
    shopStatus: r.shop_status,
    collectionState: r.collection_state,
    collectionDriver: r.collection_driver,
    checkedInAtHub: r.checked_in_at_hub === true,
    deliveryState: r.delivery_state,
    deliveryStopStatus: r.delivery_stop_status,
    deliveryDriver: r.delivery_driver,
    failedReason: r.failed_reason,
    handedToCarrier: r.handed_to_carrier === true,
    courierProblem: r.courier_problem ?? null,
    arrived: r.arrived === true,
  };
}

/**
 * The status of each package, by id. `audience: "shop"` strips driver names (FR-003).
 * One query for any number of packages.
 */
export async function packageStatuses(
  db: Queryable,
  packageIds: readonly string[],
  audience: "staff" | "shop" = "staff",
): Promise<Map<string, PackageStatusView>> {
  const out = new Map<string, PackageStatusView>();
  if (packageIds.length === 0) return out;
  const res = await db.query<PackageStatusFactsRow>(PACKAGE_STATUS_FACTS, [packageIds]);
  for (const row of res.rows) {
    const v = packageStatus(factsOf(row));
    out.set(row.package_id, audience === "shop" ? forShop(v) : v);
  }
  return out;
}
