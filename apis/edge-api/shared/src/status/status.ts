// Where a package is, derived from what happened to it. Pure: the repository reads the facts
// (`PACKAGE_STATUS_FACTS`). The furthest fact wins. Not a column: check-in, drop and carrier handover
// each have their own rows, and a stored status would be a second writer.

import { STATUS_WORD, type PackageStatus, type PackageStatusView } from "@effy/shared-types";

/** Everything recorded about one package that decides where it is. */
export interface PackageFacts {
  /** `shop_fulfillment.status`. */
  shopStatus: string;
  /** The collection `round_package.state`, latest row; null when never on a collection round. */
  collectionState: string | null;
  collectionDriver: string | null;
  /** A hub check-in exists for the collection round that picked it up. */
  checkedInAtHub: boolean;
  /** The latest delivery `round_package.state` and its stop's status; null when never on one. */
  deliveryState: string | null;
  deliveryStopStatus: string | null;
  deliveryDriver: string | null;
  /** An unresolved failed attempt newer than any proof, with its reason. */
  failedReason: string | null;
  handedToCarrier: boolean;
  arrived: boolean;
  /** An open courier problem (failed | lost | damaged | returned); null when none. */
  courierProblem?: string | null;
  /** Bags declared missing and not yet decided. Staff only: 0 for the shop. */
  bagsHeld?: number;
}

const FAILURE_WORDS: Record<string, string> = {
  nobody_home: "nobody home",
  wrong_address: "wrong address",
  customer_refused: "customer refused",
  access_blocked: "couldn't get access",
  other: "see the driver's note",
};

const COURIER_PROBLEM_WORDS: Record<string, string> = {
  failed: "delivery failed",
  lost: "lost",
  damaged: "damaged",
  returned: "returned to sender",
};

const IN_TRANSIT = new Set(["out_for_delivery", "en_route", "arrived"]);

function view(status: PackageStatus, detail: string | null = null, driverName: string | null = null): PackageStatusView {
  return { status, word: STATUS_WORD[status], detail, driverName };
}

/** Where this package is, in one of nine words. */
export function packageStatus(f: PackageFacts): PackageStatusView {
  if (f.shopStatus === "withdrawn") return view("cancelled");
  if (f.shopStatus === "unfulfillable") return view("problem", "Shop can't supply");

  if (f.shopStatus === "delivered" || f.arrived) return view("delivered");
  // Back at the hub after a failed drop, waiting for a person to choose its next step.
  if (f.failedReason !== null && f.deliveryState === "returned") {
    return view("at_hub", "Returned after a failed delivery — needs a next step");
  }
  if (f.failedReason !== null) {
    return view("problem", `Delivery attempt failed — ${FAILURE_WORDS[f.failedReason] ?? f.failedReason}`, f.deliveryDriver);
  }
  // An unresolved courier problem: after "delivered", before "with carrier".
  if (f.courierProblem) return view("problem", `With the courier — ${COURIER_PROBLEM_WORDS[f.courierProblem] ?? f.courierProblem}`);
  // Part of the package is missing.
  if ((f.bagsHeld ?? 0) > 0) {
    return view("problem", `${f.bagsHeld} bag${f.bagsHeld === 1 ? "" : "s"} missing — see Exceptions`);
  }
  if (f.handedToCarrier) return view("with_carrier");
  if (f.deliveryState === "assigned" && f.deliveryStopStatus !== null && IN_TRANSIT.has(f.deliveryStopStatus)) {
    return view("out_for_delivery", null, f.deliveryDriver);
  }
  if (f.checkedInAtHub) return view("at_hub");
  if (f.collectionState === "picked_up") return view("with_driver", null, f.collectionDriver);

  // A driver came and could not take it: still at the shop, but a missed collection is shown.
  if (f.collectionState === "not_available" && f.shopStatus === "ready_for_pickup") {
    return view("problem", "Not collected at the shop");
  }
  if (f.shopStatus === "ready_for_pickup") return view("ready");
  // `collected` with no round row: it left the shop.
  if (f.shopStatus === "collected") return view("with_driver");
  return view("preparing");
}

/** The same, for the shop: never a driver's name. */
export function forShop(v: PackageStatusView): PackageStatusView {
  return { ...v, driverName: null };
}
