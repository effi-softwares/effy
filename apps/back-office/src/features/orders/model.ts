import type {
  AdminOrderDetailDTO,
  AdminOrderHistoryEntryDTO,
  AdminOrderPackageDTO,
  AdminOrderSummaryDTO,
  OrderAwaiting,
} from "@effy/shared-types";

// Domain shapes for the back-office order console (053). The contracts double as the domain shapes
// here (identity map in repo.ts), which keeps ONE definition of an order across the wire and the
// screen — the same choice `features/shops` made.

export type OrderSummary = AdminOrderSummaryDTO;
export type OrderDetail = AdminOrderDetailDTO;
export type OrderPackage = AdminOrderPackageDTO;
export type OrderHistoryEntry = AdminOrderHistoryEntryDTO;

export interface OrderListParams {
  q?: string;
  status?: string;
  awaiting?: OrderAwaiting;
  cursor?: string;
}

/** The progress word, as the CUSTOMER currently sees it. Server-derived; never recomputed here. */
export const STAGE_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  packing: "Packing",
  on_the_way: "On the way",
  delivered: "Delivered",
};

/**
 * What the operator can do next with a package.
 *
 * ⚠ THIS IS A UX AFFORDANCE, NOT AN AUTHORISATION. The backend independently refuses a handover on a
 * same-day or uncollected package, and an arrival with no handover — this only decides which button
 * is shown so an operator is not invited to press something that will be refused.
 */
export type PackageAction = "handoff" | "arrival" | "none";

export function nextActionFor(pkg: OrderPackage): PackageAction {
  if (pkg.arrival) return "none";
  if (pkg.status !== "collected") return "none";
  // A same-day package is delivered by an Effy driver and never passes to a carrier.
  if (pkg.deliveryMethod === "same_day") return "none";
  return pkg.handoff ? "arrival" : "handoff";
}

/**
 * How a package's position reads to an operator.
 *
 * ⚠ "Handed to carrier" is a COMPLETE state whether or not a reference was recorded (FR-003). Effy
 * has no carrier contract, so most handovers genuinely have none, and the label must not hint at
 * something missing — no "(no reference)", no ellipsis, no warning glyph.
 */
export function packagePositionFor(pkg: OrderPackage): string {
  if (pkg.arrival) return "Arrived";
  if (pkg.handoff) return "With carrier";
  if (pkg.status === "collected") return pkg.deliveryMethod === "same_day" ? "Out for delivery" : "At hub";
  if (pkg.status === "ready_for_pickup") return "Packed at shop";
  if (pkg.status === "picking") return "Being picked";
  if (pkg.status === "received") return "Received by shop";
  // ⚠ 055 — two states the shop can no longer act on, and they are DIFFERENT FACTS. `unfulfillable`
  // is the shop saying it cannot supply; `withdrawn` is the order having been cancelled, which was
  // never the shop's doing. One label for both would misattribute a cancellation as a shop failure.
  if (pkg.status === "unfulfillable") return "Shop can't supply";
  if (pkg.status === "withdrawn") return "Cancelled";
  return "Awaiting shop";
}

export const AWAITING_LABEL: Record<OrderAwaiting, string> = {
  // ⚠ 055 US6 — a shop said it cannot supply its portion and nobody has decided what to do. It is
  // named for the ACTION SOMEONE MUST TAKE, not for the shop's state: the other two are late
  // packages, this one is money the platform is holding for goods that will never be sent.
  refund_decision: "Needs a refund decision",
  handover: "Needs handover",
  arrival: "Awaiting arrival",
};
