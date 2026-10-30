/**
 * Who delivers an order (Effy or a courier) and how every customer surface says it: checkout, the order
 * list and page, the receipt and its email print `deliverySummary`; the customer app's Kotlin twin is
 * pinned to `delivery-type.fixtures.json`. The customer's words for an Effy order are "Same-day delivery"
 * and "Standard delivery"; a courier order is neither.
 */
import { COVERAGE_LABEL, DELIVERY_WINDOW_WORDS } from "./delivery";
import { distinctArrivals, formatArrival, type ArrivalPromise } from "./delivery-window";

/** Who delivers an order. One per order, whatever number of suppliers fill it. */
export type DeliveryType = "effy" | "courier";

/**
 * Why an order has its type. Staff only; a customer is told the type, never the reason.
 *  in_coverage the address is on Effy's list
 *  out_of_coverage it is not, and a courier reaches it
 *  no_window it is, but no window was available and the business allows courier instead
 *  staff_change changed by back-office after payment
 */
export type DeliveryTypeReason = "in_coverage" | "out_of_coverage" | "no_window" | "staff_change";

/** What an Effy order was sold: a time on a day, a day with no time, or "as soon as possible". */
export type DeliveryPromise = "window" | "day" | "asap";

/** An order's delivery, as a customer contract carries it. */
export interface OrderDeliveryDTO {
  type: DeliveryType;
  /** Absent on a courier order. `day`: the arrival has the day and no hours. `asap`: no arrival, only `asapEstimate`. */
  promise?: DeliveryPromise;
  /** Present exactly when `promise` is `asap`. */
  asapEstimate?: string;
  /** The courier's usual timeframe as it was sold ("2–4 business days"); null for an Effy order. */
  courierEstimate: string | null;
  /**
   * How the customer follows a courier order: `link` (one consignment with a tracking link) or `email`
   * (several, each tracking emailed). Absent otherwise. Never a count or anything per parcel.
   */
  tracking?: { kind: "link"; url: string; courierName: string } | { kind: "email" };
  /**
   * Present only after back-office moved the order to the other type: the latest move and what the
   * customer received. Never the reason, the courier fee, the difference or Effy's cost.
   */
  moved?: OrderDeliveryMoveDTO;
}

/** What a customer received when their order was moved to courier; null when nothing was given. */
export type CustomerCompensationDTO =
  | { kind: "points"; amount: string; points: number }
  | { kind: "refund"; amount: string };

/** The latest move of an order's delivery type by back-office, as the customer reads it. */
export interface OrderDeliveryMoveDTO {
  to: DeliveryType;
  at: string;
  compensation: CustomerCompensationDTO | null;
}

/** The only place these words are written; `effy`/`courier` and `sameDay`/`standard` reuse the coverage labels and window section names. */
export const DELIVERY_TYPE_WORDS = {
  effy: COVERAGE_LABEL.effy,
  courier: COVERAGE_LABEL.courier,
  courierPartner: "Delivered by a courier partner.",
  courierEstimatePrefix: "Usually arrives in",
  /** Never drop this: without it the estimate reads as a promised date. */
  courierEstimateSuffix: "- an estimate, not a guaranteed date.",
  /**
   * What a listed address reads when no window is left and the business sends the order by courier.
   * Not `DELIVERY_WINDOW_WORDS.noWindows`, which ends "Please try again later".
   */
  noWindowsLeft: "There are no Effy delivery windows available in the next few days.",
  courierInsteadOfWindows: "We can send this order by courier instead.",
  sameDay: DELIVERY_WINDOW_WORDS.sectionSameDay,
  standard: DELIVERY_WINDOW_WORDS.sectionStandard,
  /** Tracking a courier order. */
  trackParcel: "Track your parcel",
  trackingByEmail: "Tracking for each parcel is sent to you by email.",
  withCourier: "Your order is with the courier.",
  /** The `scheduled` method, never sold since 047. */
  scheduled: "Scheduled delivery",
  /** Back-office moved the order: said once, after the delivery lines; never why. */
  movedToCourier: "We've changed this order to courier delivery.",
  movedToEffy: "We've changed this order back to delivery by Effy.",
  /** `%POINTS%` and `%AMOUNT%` are filled by `compensationLine`; `%AMOUNT%` is "$3.50". */
  compensationPoints: "We've added %POINTS% points (%AMOUNT%) to your account to make up for it.",
  compensationRefund: "We've refunded %AMOUNT% to your card to make up for it.",
} as const;

/** "$3.50" from a wire amount ("3.50"). */
const dollars = (amount: string) => `$${amount}`;

/** The one sentence saying what a customer received for a move to courier, on every surface; null when nothing. */
export function compensationLine(c: CustomerCompensationDTO | null | undefined): string | null {
  if (!c) return null;
  if (c.kind === "points") {
    return DELIVERY_TYPE_WORDS.compensationPoints.replace("%POINTS%", String(c.points)).replace("%AMOUNT%", dollars(c.amount));
  }
  return DELIVERY_TYPE_WORDS.compensationRefund.replace("%AMOUNT%", dollars(c.amount));
}

/** The lines a move adds: what changed, then what the customer received (if anything). */
export function movedLines(m: OrderDeliveryMoveDTO | null | undefined): string[] {
  if (!m) return [];
  const said = m.to === "courier" ? DELIVERY_TYPE_WORDS.movedToCourier : DELIVERY_TYPE_WORDS.movedToEffy;
  const comp = m.to === "courier" ? compensationLine(m.compensation) : null;
  return comp ? [said, comp] : [said];
}

/** "Usually arrives in 2–4 business days - an estimate, not a guaranteed date." */
export function courierEstimateSentence(estimate: string): string {
  return `${DELIVERY_TYPE_WORDS.courierEstimatePrefix} ${estimate} ${DELIVERY_TYPE_WORDS.courierEstimateSuffix}`;
}

/** The two lines under "Courier delivery", at checkout and on the order alike. */
export function courierLines(estimate: string): string[] {
  return [DELIVERY_TYPE_WORDS.courierPartner, courierEstimateSentence(estimate)];
}

/** "As soon as possible - usually within 2–3 days". */
export function asapSentence(estimate: string): string {
  return `${DELIVERY_WINDOW_WORDS.asapEstimatePrefix} ${estimate}`.trim();
}

/** What a customer surface prints for an order's delivery. */
export interface DeliverySummary {
  /** "Delivered by Effy" / "Courier delivery". */
  heading: string;
  /** Never empty. */
  lines: string[];
}

/** The fields `deliverySummary` reads; the customer's `OrderDTO` satisfies it. */
export interface DeliverySummaryInput {
  delivery: OrderDeliveryDTO;
  arrivalEstimates: readonly (ArrivalPromise & { method?: string | null })[];
}

/**
 * The customer's word for an Effy delivery from the package's method: "Same-day delivery" for a window
 * today, "Standard delivery" for a later day. Never for a courier order (its method is routing).
 */
export function deliveryMethodWord(method: string | null | undefined): string {
  if (method === "same_day") return DELIVERY_TYPE_WORDS.sameDay;
  if (method === "scheduled") return DELIVERY_TYPE_WORDS.scheduled;
  return DELIVERY_TYPE_WORDS.standard;
}

/**
 * How an order is delivered, in the words every customer surface prints:
 *  courier → "Courier delivery" · the partner line, then the estimate as an estimate
 *  Effy, a window today → "Delivered by Effy" · "Same-day delivery · Today, 4 pm – 6 pm"
 *  Effy, a later day → "Delivered by Effy" · "Standard delivery · Thu 8 Oct, 4 pm – 6 pm"
 *  Effy, a day, no time → "Delivered by Effy" · "Standard delivery · Thu 8 Oct · Any time during the day"
 *  Effy, as soon as poss. → "Delivered by Effy" · "As soon as possible - usually within 2–3 days"
 *  moved by back-office → the above, then `movedLines`
 * A courier order never reads its arrival estimates. One line per distinct promise (`distinctArrivals`),
 * so the line count never reveals the number of suppliers.
 */
export function deliverySummary(order: DeliverySummaryInput, now: Date): DeliverySummary {
  if (order.delivery.type === "courier") {
    const lines = courierLines(order.delivery.courierEstimate ?? "");
    // Several consignments: tracking comes by email. A single link is rendered by the surface from `delivery.tracking`.
    if (order.delivery.tracking?.kind === "email") lines.push(DELIVERY_TYPE_WORDS.trackingByEmail);
    // A back-office move is said after the delivery lines.
    lines.push(...movedLines(order.delivery.moved));
    return { heading: DELIVERY_TYPE_WORDS.courier, lines };
  }
  // "As soon as possible" was sold an estimate, never a day.
  if (order.delivery.promise === "asap") {
    const lines = [asapSentence(order.delivery.asapEstimate ?? ""), ...movedLines(order.delivery.moved)];
    return { heading: DELIVERY_TYPE_WORDS.effy, lines };
  }
  const anyTime = order.delivery.promise === "day" ? ` · ${DELIVERY_WINDOW_WORDS.anyTimeDay}` : "";
  const arrivals = distinctArrivals(order.arrivalEstimates);
  const lines = arrivals.length === 0
    ? [formatArrival({ promisedFrom: null, promisedTo: null }, now)]
    : arrivals.map((a) => `${deliveryMethodWord(a.method)} · ${formatArrival(a, now)}${anyTime}`);
  lines.push(...movedLines(order.delivery.moved));
  return { heading: DELIVERY_TYPE_WORDS.effy, lines };
}

/** What drivers and staff read for a parcel sold a day with no time; shops and customers read `DELIVERY_WINDOW_WORDS.anyTimeDay`. */
export const ANY_TIME_LABEL = "Any time";

/** "Thu 8 Oct · Any time": an untimed parcel is named by its day, never by its window's hours. */
export function anyTimeDayLabel(date: string, now: Date): string {
  return `${formatArrival({ promisedFrom: date, promisedTo: date }, now)} · ${ANY_TIME_LABEL}`;
}

/** Who takes a package away from the shop, as shop staff read it. Never a window, a day or a fee. */
export type DeliveredBy = "effy_driver" | "courier";

/** The shop's two words; "Same-day" and "standard" are the customer's and never shown to a shop. */
export const DELIVERED_BY_WORDS = {
  effy_driver: "Effy driver",
  courier: "Courier",
} as const satisfies Record<DeliveredBy, string>;
