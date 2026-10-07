// Where a package is — derived from what actually happened to it (073).
//
// ⚠ PURE. The repository reads the facts (`PACKAGE_STATUS_FACTS`); this decides what they mean. Every
// combination is then a row in a table-driven test rather than a database fixture.
//
// ⚠ THE FURTHEST FACT WINS. A package that has an arrival recorded is Delivered even if, through some
// earlier failure, its hub check-in was never written; showing an earlier step than something we
// KNOW happened would be the same defect this replaces, in the other direction.
//
// ⚠ WHY IT IS NOT A COLUMN. `shop_fulfillment.status` deliberately stops at `collected` (063 R9): a
// check-in, a started drop and a carrier handover are each recorded once, in their own rows. A
// stored "at_hub" would be a second record of each of them, written by a second writer, and the two
// would disagree the first time one write failed.

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
}

const FAILURE_WORDS: Record<string, string> = {
  nobody_home: "nobody home",
  wrong_address: "wrong address",
  customer_refused: "customer refused",
  access_blocked: "couldn't get access",
  other: "see the driver's note",
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
  if (f.failedReason !== null) {
    return view("problem", `Delivery attempt failed — ${FAILURE_WORDS[f.failedReason] ?? f.failedReason}`, f.deliveryDriver);
  }
  if (f.handedToCarrier) return view("with_carrier");
  if (f.deliveryState === "assigned" && f.deliveryStopStatus !== null && IN_TRANSIT.has(f.deliveryStopStatus)) {
    return view("out_for_delivery", null, f.deliveryDriver);
  }
  if (f.checkedInAtHub) return view("at_hub");
  if (f.collectionState === "picked_up") return view("with_driver", null, f.collectionDriver);

  // ⚠ A driver came and could not take it. The shop still has it (status unchanged, ready again for
  // the next round) — but saying only "Ready" would hide that a collection was missed.
  if (f.collectionState === "not_available" && f.shopStatus === "ready_for_pickup") {
    return view("problem", "Not collected at the shop");
  }
  if (f.shopStatus === "ready_for_pickup") return view("ready");
  // `collected` with no round row is a package collected before 063's model; it left the shop.
  if (f.shopStatus === "collected") return view("with_driver");
  return view("preparing");
}

/** The same, for the shop: never a driver's name (073 FR-003). */
export function forShop(v: PackageStatusView): PackageStatusView {
  return { ...v, driverName: null };
}
