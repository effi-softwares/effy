import { formatDeliveryDay, formatDeliveryWindow } from "@effy/shared-types";
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
  /** 073 — only orders with a package nobody is collecting or delivering. */
  needsDriver?: boolean;
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

/** "Thu 8 Oct" from an ISO day. A calendar date has no timezone, so this is arithmetic on the string. */
export { formatDeliveryDay, formatDeliveryWindow, windowStateAt } from "@effy/shared-types";

/**
 * What a package was promised, in words (069). Null when it was promised nothing — every order
 * placed before 069 — and the row then says nothing rather than "—", which would read as missing data.
 */
export function promiseTextFor(pkg: OrderPackage): string | null {
  if (!pkg.promisedDate) return null;
  const day = formatDeliveryDay(pkg.promisedDate);
  return pkg.window ? `${day}, ${formatDeliveryWindow(pkg.window)}` : day;
}

/** The one thing staff should notice about a package's promise, or null when there is nothing to notice. */
export type PromiseFlag = "at_risk" | "late" | "on_time" | "over_capacity";

export function promiseFlagsFor(pkg: OrderPackage): PromiseFlag[] {
  const flags: PromiseFlag[] = [];
  if (pkg.atRisk) flags.push("at_risk");
  if (pkg.onTime === false) flags.push("late");
  if (pkg.onTime === true) flags.push("on_time");
  if (pkg.overCapacity) flags.push("over_capacity");
  return flags;
}

export const PROMISE_FLAG_LABEL: Record<PromiseFlag, string> = {
  at_risk: "At risk of missing its day",
  late: "Arrived late",
  on_time: "Arrived on time",
  over_capacity: "Slot over capacity",
};

export function nextActionFor(pkg: OrderPackage): PackageAction {
  if (pkg.arrival) return "none";
  if (pkg.status !== "collected") return "none";
  // A same-day package is delivered by an Effy driver and never passes to a carrier.
  if (pkg.deliveryMethod === "same_day") return "none";
  // 078 — nor does a standard package that was sold a WINDOW: "standard" now also means Effy, on a
  // later day. Only a package with no window is a carrier's.
  if (pkg.window) return "none";
  return pkg.handoff ? "arrival" : "handoff";
}


export const AWAITING_LABEL: Record<OrderAwaiting, string> = {
  // ⚠ 055 US6 — a shop said it cannot supply its portion and nobody has decided what to do. It is
  // named for the ACTION SOMEONE MUST TAKE, not for the shop's state: the other two are late
  // packages, this one is money the platform is holding for goods that will never be sent.
  refund_decision: "Needs a refund decision",
  handover: "Needs handover",
  arrival: "Awaiting arrival",
};
