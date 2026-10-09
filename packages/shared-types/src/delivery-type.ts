/**
 * Who delivers an order — Effy, or a courier — and how every customer surface says it (079).
 *
 * Contract: `specs/079-effy-vs-courier-checkout/contracts/routes.md`.
 *
 * ⚠ ONE WORDING, IN ONE PLACE. The checkout, the order list, the order page, the receipt and the
 * emailed receipt all print `deliverySummary`; the customer app carries a Kotlin twin pinned to
 * `delivery-type.fixtures.json`. Seven surfaces that each word it themselves never fail when they
 * disagree — and a receipt that says "Standard delivery, Thursday" for a parcel a courier is carrying
 * is a broken promise in writing.
 *
 * ⚠ THE CUSTOMER'S WORDS FOR AN EFFY ORDER STAY "Same-day delivery" and "Standard delivery"
 * (operator decision, 078). A courier order is never either: it has no window and no day.
 */
import { COVERAGE_LABEL, DELIVERY_WINDOW_WORDS } from "./delivery";
import { distinctArrivals, formatArrival, type ArrivalPromise } from "./delivery-window";

/** Who delivers an order. One per order, whatever number of suppliers fill it. */
export type DeliveryType = "effy" | "courier";

/**
 * Why an order has its type. STAFF ONLY — a customer is told the type and never the reason.
 *   in_coverage      the address is on Effy's list
 *   out_of_coverage  it is not, and a courier reaches it
 *   no_window        it is, but no Effy window was available and the business allows courier instead
 *   staff_change     changed by back-office after payment
 */
export type DeliveryTypeReason = "in_coverage" | "out_of_coverage" | "no_window" | "staff_change";

/** An order's delivery, as a customer contract carries it. ABSENT on an order placed before 079. */
export interface OrderDeliveryDTO {
  type: DeliveryType;
  /** The courier's usual timeframe as it was sold ("2–4 business days"); null for an Effy order. */
  courierEstimate: string | null;
  /**
   * 080 — how the customer follows a courier order (Q8). `link`: the order travels as ONE
   * consignment and the courier gave a tracking link. `email`: it travels as more than one, and each
   * parcel's tracking is emailed. Absent otherwise (not handed over yet, or no link given).
   * ⚠ Never a count, a reference without a link, or anything per parcel.
   */
  tracking?: { kind: "link"; url: string; courierName: string } | { kind: "email" };
  /**
   * 081 — present only after back-office moved the order to the other delivery type: the LATEST move,
   * and what the customer received for it. ⚠ Never the staff reason, the courier fee, the difference
   * or Effy's cost — a customer is told what happened and what they got, nothing else.
   */
  moved?: OrderDeliveryMoveDTO;
}

/** 081 — what a customer received when their order was moved to courier. Null when nothing was given. */
export type CustomerCompensationDTO =
  | { kind: "points"; amount: string; points: number }
  | { kind: "refund"; amount: string };

/** 081 — the latest move of an order's delivery type by back-office, as the customer reads it. */
export interface OrderDeliveryMoveDTO {
  to: DeliveryType;
  at: string;
  compensation: CustomerCompensationDTO | null;
}

/**
 * ⚠ THE ONLY PLACE THESE WORDS ARE WRITTEN. `effy` and `courier` are 076's coverage labels and
 * `sameDay` / `standard` are 078's section names — re-used, not retyped.
 */
export const DELIVERY_TYPE_WORDS = {
  effy: COVERAGE_LABEL.effy,
  courier: COVERAGE_LABEL.courier,
  courierPartner: "Delivered by a courier partner.",
  courierEstimatePrefix: "Usually arrives in",
  /** ⚠ Never drop this: without it the estimate reads as a promised date (FR-015). */
  courierEstimateSuffix: "— an estimate, not a guaranteed date.",
  /**
   * The two sentences an address Effy DOES deliver to reads when no window is left and the business
   * sends such an order by courier instead. ⚠ Not `DELIVERY_WINDOW_WORDS.noWindows`: that one ends
   * "Please try again later", which is the opposite of what is being offered here.
   */
  noWindowsLeft: "There are no Effy delivery windows available in the next few days.",
  courierInsteadOfWindows: "We can send this order by courier instead.",
  sameDay: DELIVERY_WINDOW_WORDS.sectionSameDay,
  standard: DELIVERY_WINDOW_WORDS.sectionStandard,
  /** 080 — tracking a courier order. */
  trackParcel: "Track your parcel",
  trackingByEmail: "Tracking for each parcel is sent to you by email.",
  withCourier: "Your order is with the courier.",
  /** A method no checkout has sold since 047; an old order may still carry it. */
  scheduled: "Scheduled delivery",
  /** 081 — back-office moved the order. ⚠ Said once, after the delivery lines; never why. */
  movedToCourier: "We've changed this order to courier delivery.",
  movedToEffy: "We've changed this order back to delivery by Effy.",
  /** 081 — `%POINTS%` and `%AMOUNT%` are filled by `compensationLine`; `%AMOUNT%` is "$3.50". */
  compensationPoints: "We've added %POINTS% points (%AMOUNT%) to your account to make up for it.",
  compensationRefund: "We've refunded %AMOUNT% to your card to make up for it.",
} as const;

/** 081 — "$3.50" from a wire amount ("3.50"). */
const dollars = (amount: string) => `$${amount}`;

/**
 * 081 — the one sentence that says what a customer received for a move to courier; null when nothing
 * was given. ⚠ The ONE wording: the order page, the receipt, the app and the email all print this.
 */
export function compensationLine(c: CustomerCompensationDTO | null | undefined): string | null {
  if (!c) return null;
  if (c.kind === "points") {
    return DELIVERY_TYPE_WORDS.compensationPoints.replace("%POINTS%", String(c.points)).replace("%AMOUNT%", dollars(c.amount));
  }
  return DELIVERY_TYPE_WORDS.compensationRefund.replace("%AMOUNT%", dollars(c.amount));
}

/** 081 — the lines a move adds: what changed, then what the customer received (if anything). */
export function movedLines(m: OrderDeliveryMoveDTO | null | undefined): string[] {
  if (!m) return [];
  const said = m.to === "courier" ? DELIVERY_TYPE_WORDS.movedToCourier : DELIVERY_TYPE_WORDS.movedToEffy;
  const comp = m.to === "courier" ? compensationLine(m.compensation) : null;
  return comp ? [said, comp] : [said];
}

/** "Usually arrives in 2–4 business days — an estimate, not a guaranteed date." */
export function courierEstimateSentence(estimate: string): string {
  return `${DELIVERY_TYPE_WORDS.courierEstimatePrefix} ${estimate} ${DELIVERY_TYPE_WORDS.courierEstimateSuffix}`;
}

/** The two lines a customer reads under "Courier delivery" — at checkout and on the order alike. */
export function courierLines(estimate: string): string[] {
  return [DELIVERY_TYPE_WORDS.courierPartner, courierEstimateSentence(estimate)];
}

/** What a customer surface prints for an order's delivery. */
export interface DeliverySummary {
  /** "Delivered by Effy" / "Courier delivery"; null for an order placed before 079. */
  heading: string | null;
  /** Never empty. */
  lines: string[];
}

/** The fields `deliverySummary` reads — the customer's `OrderDTO` satisfies it. */
export interface DeliverySummaryInput {
  delivery?: OrderDeliveryDTO | null;
  arrivalEstimates: readonly (ArrivalPromise & { method?: string | null })[];
}

/**
 * The customer's word for an Effy delivery, from the package's method: "Same-day delivery" for a
 * window today, "Standard delivery" for a later day (and for every order that predates windows).
 * ⚠ Never call it for a courier order: its packages' method is how they are routed, not what was sold.
 */
export function deliveryMethodWord(method: string | null | undefined): string {
  if (method === "same_day") return DELIVERY_TYPE_WORDS.sameDay;
  if (method === "scheduled") return DELIVERY_TYPE_WORDS.scheduled;
  return DELIVERY_TYPE_WORDS.standard;
}

/**
 * How an order is delivered, in the words every customer surface prints.
 *
 *   courier                → "Courier delivery" · the partner line, then the estimate as an estimate
 *   Effy, a window today   → "Delivered by Effy" · "Same-day delivery · Today, 4 pm – 6 pm"
 *   Effy, a later day      → "Delivered by Effy" · "Standard delivery · Thu 8 Oct, 4 pm – 6 pm"
 *   placed before 079      → no heading · one line per distinct promise, as it was sold
 *   moved by back-office   → the above, then `movedLines` (081)
 *
 * ⚠ A courier order NEVER reads its arrival estimates: it has no window and no day, and the
 * package's own method word would call it "Standard delivery".
 * ⚠ One line per DISTINCT promise (`distinctArrivals`): a line per package told the customer how
 * many suppliers there were.
 */
export function deliverySummary(order: DeliverySummaryInput, now: Date): DeliverySummary {
  if (order.delivery?.type === "courier") {
    const lines = courierLines(order.delivery.courierEstimate ?? "");
    // 080 — several consignments: say tracking comes by email. One link is a link, not a sentence;
    // surfaces render it from `delivery.tracking` themselves.
    if (order.delivery.tracking?.kind === "email") lines.push(DELIVERY_TYPE_WORDS.trackingByEmail);
    // 081 — a move by back-office is said after the delivery lines.
    lines.push(...movedLines(order.delivery.moved));
    return { heading: DELIVERY_TYPE_WORDS.courier, lines };
  }
  const arrivals = distinctArrivals(order.arrivalEstimates);
  const lines = arrivals.length === 0
    ? [formatArrival({ promisedFrom: null, promisedTo: null }, now)]
    : arrivals.map((a) => `${deliveryMethodWord(a.method)} · ${formatArrival(a, now)}`);
  lines.push(...movedLines(order.delivery?.moved));
  return { heading: order.delivery?.type === "effy" ? DELIVERY_TYPE_WORDS.effy : null, lines };
}

/** Who takes a package away from the shop, as SHOP staff read it. Never a window, a day or a fee. */
export type DeliveredBy = "effy_driver" | "courier";

/** ⚠ The shop's two words. "Same-day" and "standard" are the customer's and never shown to a shop. */
export const DELIVERED_BY_WORDS = {
  effy_driver: "Effy driver",
  courier: "Courier",
} as const satisfies Record<DeliveredBy, string>;
