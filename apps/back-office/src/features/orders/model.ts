import { DELIVERY_TYPE_WORDS, formatDeliveryDay, formatDeliveryWindow } from "@effy/shared-types";
import type { AdminOrderDeliveryFilter, DeliveryType, DeliveryTypeChangeDTO, DeliveryTypeReason } from "@effy/shared-types";
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
  /** 079 — who delivers the order; `legacy` = placed before orders had a delivery type. */
  deliveryType?: AdminOrderDeliveryFilter;
  cursor?: string;
}

// ── 079: who delivers an order ───────────────────────────────────────────────────────────────────

/**
 * "Delivered by Effy" / "Courier delivery" — the same two names the customer reads
 * (`DELIVERY_TYPE_WORDS`). An order placed before 079 has no type and says so with a dash: nothing
 * about an old order is guessed.
 */
export function deliveryTypeText(type: DeliveryType | null): string {
  return type ? DELIVERY_TYPE_WORDS[type] : "—";
}

/** The list filter's options, in the order they are offered. */
export const DELIVERY_FILTER_LABEL: Record<AdminOrderDeliveryFilter, string> = {
  effy: DELIVERY_TYPE_WORDS.effy,
  courier: DELIVERY_TYPE_WORDS.courier,
  legacy: "Placed before delivery types",
};

/** Why an order has its delivery type — staff words. A customer is never told this. */
export const DELIVERY_REASON_LABEL: Record<DeliveryTypeReason, string> = {
  in_coverage: "The address is in Effy's delivery area",
  out_of_coverage: "The address is outside Effy's delivery area",
  no_window: "No Effy delivery window was available",
  staff_change: "Changed by staff",
};

/** One history line: "Delivered by Effy → Courier delivery", or just the type for the first entry. */
export function deliveryChangeText(c: DeliveryTypeChangeDTO): string {
  return c.from ? `${DELIVERY_TYPE_WORDS[c.from]} → ${DELIVERY_TYPE_WORDS[c.to]}` : DELIVERY_TYPE_WORDS[c.to];
}

/**
 * What a package row says about its delivery: who takes it to the customer and, for one Effy
 * delivers, the customer's own word for it ("Same-day" / "Standard") — the word an operator hears on
 * the phone. ⚠ A courier's package has no such word: it is "standard" only in how it is routed.
 */
export function packageDeliveryText(pkg: Pick<OrderPackage, "deliveredBy" | "deliveryMethod">): string {
  if (pkg.deliveredBy === "courier") return DELIVERY_TYPE_WORDS.courier;
  const word = pkg.deliveryMethod === "same_day" ? "Same-day" : pkg.deliveryMethod === "standard" ? "Standard" : null;
  return word ? `${DELIVERY_TYPE_WORDS.effy} · ${word}` : DELIVERY_TYPE_WORDS.effy;
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
  // ⚠ 079 — WHO DELIVERS IS THE SERVER'S ANSWER (`deliveredBy`), for old orders and new. A package
  // Effy delivers itself — today, or in a window on a later day — never passes to a carrier. This
  // used to be worked out here from the method and the window; the server now says it once.
  if (pkg.deliveredBy === "effy") return "none";
  return pkg.handoff ? "arrival" : "handoff";
}


export const AWAITING_LABEL: Record<OrderAwaiting, string> = {
  // ⚠ 055 US6 — a shop said it cannot supply its portion and nobody has decided what to do. It is
  // named for the ACTION SOMEONE MUST TAKE, not for the shop's state: the other two are late
  // packages, this one is money the platform is holding for goods that will never be sent.
  refund_decision: "Needs a refund decision",
  // ⚠ 080 US5 — a courier lost, damaged or returned a parcel, or could not deliver it.
  courier_problem: "Courier problem",
  handover: "Needs handover",
  arrival: "Awaiting arrival",
};
