// Where a package is: one short list of nine words, the same on every staff screen. Derived from what
// happened (`packageStatus` in @effy/edge-shared), not from the shop's status, which stops at
// `collected`. `package-status.guard.test.ts` fails if an app maps shop statuses to words another way.
// The customer's one-word stage is a separate, coarser view.

export type PackageStatus =
  | "preparing"
  | "ready"
  | "with_driver"
  | "at_hub"
  | "out_for_delivery"
  | "with_carrier"
  | "delivered"
  | "problem"
  | "cancelled";

export const PACKAGE_STATUSES: readonly PackageStatus[] = [
  "preparing",
  "ready",
  "with_driver",
  "at_hub",
  "out_for_delivery",
  "with_carrier",
  "delivered",
  "problem",
  "cancelled",
];

/** The word every staff screen shows. */
export const STATUS_WORD: Record<PackageStatus, string> = {
  preparing: "Preparing",
  ready: "Ready",
  with_driver: "With driver",
  at_hub: "At hub",
  out_for_delivery: "Out for delivery",
  with_carrier: "With carrier",
  delivered: "Delivered",
  problem: "Problem",
  cancelled: "Cancelled",
};

/**
 * How the pill is coloured - the platform's closed status mapping: in progress → brand,
 * complete → success, waiting → warning, failed → destructive, inert → muted. Always shown with the
 * word; the tone only reinforces it.
 */
export const STATUS_TONE: Record<PackageStatus, "brand" | "success" | "warning" | "destructive" | "muted"> = {
  preparing: "muted",
  ready: "warning",
  with_driver: "brand",
  at_hub: "brand",
  out_for_delivery: "brand",
  with_carrier: "brand",
  delivered: "success",
  problem: "destructive",
  cancelled: "muted",
};

/** A package's status as a screen shows it. */
export interface PackageStatusView {
  status: PackageStatus;
  /** `STATUS_WORD[status]` - sent so a client that cannot import this file (the driver app) shows the same word. */
  word: string;
  /** One line for `problem` ("Not collected at the shop"); null otherwise. */
  detail: string | null;
  /** The driver holding it, for `with_driver` and `out_for_delivery`. Staff only: the shop service always sends null. */
  driverName: string | null;
}

/** The least advanced of several packages - what an order row shows. Problem and cancelled win. */
export function leastAdvanced(views: readonly PackageStatusView[]): PackageStatusView | null {
  if (views.length === 0) return null;
  const problem = views.find((v) => v.status === "problem");
  if (problem) return problem;
  const live = views.filter((v) => v.status !== "cancelled");
  if (live.length === 0) return views[0]!;
  return [...live].sort((a, b) => PACKAGE_STATUSES.indexOf(a.status) - PACKAGE_STATUSES.indexOf(b.status))[0]!;
}
