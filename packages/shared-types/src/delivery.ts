/**
 * Delivery: customer-facing contracts, shared by the backend, customer-web and the customer app. Money is
 * a 2-dp decimal string. Nothing here carries a distance, band, weight, fee plan or shop identity; the
 * fee is lines and a total (`delivery-fee.ts`).
 */

import type { CheckoutPointsDTO } from "./checkout";
import type { DeliveryFeeDTO } from "./delivery-fee";

/** The customer's words for when an Effy order arrives: `same_day` (a window today) or `standard` (a later day). No price of its own. */
export type DeliveryMethod = "same_day" | "standard";

/**
 * Who delivers to an address:
 *  effy the postcode is on Effy's list; Effy's drivers deliver
 *  courier not on the list, and courier delivery is offered there
 *  none neither reaches it
 * Decided only by `public.coverage_for_postcode`, when asked, never stored against an address. A
 * customer contract carries this value and nothing about why.
 */
export type CoverageKind = "effy" | "courier" | "none";

/** The only place these words are written: every response and customer screen renders them (`coverage.guard.test.ts`). */
export const COVERAGE_LABEL = {
  effy: "Delivered by Effy",
  courier: "Courier delivery",
} as const satisfies Record<Exclude<CoverageKind, "none">, string>;

/** The problem `code` of a request refused because nobody delivers to the address. */
export const COVERAGE_REFUSAL_CODE = "address_not_covered";

/** The one sentence a customer reads when nobody delivers to their address. */
export const COVERAGE_REFUSAL_SENTENCE = "Sorry, we can't deliver to this address.";

/** Australian state / territory — the closed set the place record uses. */
export type AustralianState = "ACT" | "NSW" | "NT" | "QLD" | "SA" | "TAS" | "VIC" | "WA";

/**
 * The delivery quote shown at checkout, captured server-side so the order is honoured at it (the client
 * never sends a fee). A serviced address answers `effyWindows` or `courier`. No package list.
 */
export interface DeliveryQuoteDTO {
  postcode: string;
  serviced: boolean;
  /** Who delivers to this address. `none` means not serviced; `courier` only when a courier order can be placed. */
  coverage?: CoverageKind;
  /** ISO datetime with the Australia/Melbourne offset; "" when not serviced. */
  expiresAt: string;
  /** The customer's spendable points, when they have any. */
  points?: CheckoutPointsDTO;
  /** How much more the basket needs for free delivery; null when there is no such amount or it is reached. */
  freeDeliveryRemainingAmount?: string | null;
  /** Present exactly when `coverage` is `"effy"`: today's windows ("Same-day delivery") and later days' ("Standard delivery"). The choice goes back as `deliveryWindow`. */
  effyWindows?: EffyWindowsDTO | null;
  /**
   * Present exactly when `coverage` is `"courier"`: nothing to choose; show "Courier delivery", the
   * estimate and the fee, and send `deliveryType: "courier"`. No distance, company or supplier count.
   */
  courier?: CourierQuoteDTO;
}

/** What a customer is told and charged when a courier delivers the order. */
export interface CourierQuoteDTO {
  /** The courier's usual timeframe in the business's words ("2–4 business days"); always printed through `courierLines`. */
  estimate: string;
  /** The courier fee for the whole order: lines and a total. */
  fee: DeliveryFeeDTO;
  /**
   * `out_of_coverage`: Effy does not deliver there. `no_window`: it does, but no window is available
   * and the business sends it by courier; the client says there are no windows first.
   */
  reason: CourierQuoteReason;
}

/** Why a courier delivers this order. Named, so the generated Kotlin enum is too. */
export type CourierQuoteReason = "out_of_coverage" | "no_window";

/** The only place these words are written; the app's `DeliveryWindowWords.kt` mirrors them (tested). "Standard delivery" means Effy, a later day. */
export const DELIVERY_WINDOW_WORDS = {
  sectionSameDay: "Same-day delivery",
  sectionStandard: "Standard delivery",
  todayClosed: "No windows left today.",
  todayNotDeliveryDay: "We don't deliver today.",
  dayFull: "Every window on this day is taken.",
  noWindows: "There are no delivery windows available in the next few days. Please try again later.",
  cutoffPrefix: "Order by",
  // Standard delivery without a time.
  anyTimeDay: "Any time during the day",
  timeOptionOpen: "Need a specific time?",
  timeOptionHint: "Optional. Pick a window and we'll deliver in it.",
  /** The day has no room left for an order without a time, but a window on it does. */
  timeRequired: "Choose a time for this day.",
  asapTitle: "Standard",
  asapHint: "We'll deliver as soon as we can.",
  /** Followed by the business's estimate: always an estimate, never a day. */
  asapEstimatePrefix: "As soon as possible —",
} as const;

/** Why a day has no window to choose. A later day is only ever "full". */
export type EffyDayClosedReason = "not_delivery_day" | "closed" | "full";

/** One window on one day. No capacity or remaining count: a full window is absent. */
export interface EffyWindowDTO {
  /** Opaque. Sent back with `date` as `deliveryWindow` on the intent request. */
  slotId: string;
  /** yyyy-mm-dd (Melbourne). */
  date: string;
  /** ISO datetimes with the Australia/Melbourne offset. */
  startAt: string;
  endAt: string;
  /** After this the window can no longer be chosen. */
  cutoffAt: string;
  /** What this window adds over the plain later-day fee; "0.00" when nothing. */
  surchargeAmount: string;
  /** The order's delivery charge with this window chosen. */
  fee: DeliveryFeeDTO;
}

/** One day on offer: today (`same_day`) or a later delivery day (`standard`). */
export interface EffyDayDTO {
  date: string;
  section: DeliveryMethod;
  /** Open windows only, earliest first. */
  windows: EffyWindowDTO[];
  /** Why `windows` is empty; null when it is not. */
  closedReason: EffyDayClosedReason | null;
  /** This day sold with no time, sent back as `deliveryWindow`; the order is promised the day. Always null for today, never in `windows`. */
  anyTime?: EffyWindowDTO | null;
}

export interface EffyWindowsDTO {
  /** Today first, then the next delivery days. Never empty. */
  days: EffyDayDTO[];
  /** Set when no window is open on any day: `no_windows` (closed or taken) or `none_defined` (none switched on). */
  unavailable: "no_windows" | "none_defined" | null;
  /** "As soon as possible", when some day can take an untimed order. Carries no day; chosen with `deliveryPromise: "asap"`. */
  asap?: EffyAsapDTO | null;
}

export interface EffyAsapDTO {
  /** The business's words, e.g. "usually within 2–3 days". Print it only as an estimate. */
  estimate: string;
  /** Never carries a window or a delivery-today surcharge. */
  fee: DeliveryFeeDTO;
}

/**
 * Why an intent was refused over the delivery choice: the `code` of a 409, with a fresh `quote`. A
 * refusal never substitutes a window or a day; the customer chooses again.
 */
export type DeliveryChoiceRefusalCode =
  | "slot_required" | "slot_unavailable" | "date_unavailable" | "no_windows_available"
  /** The type the client showed is not the one that applies (or none was sent for a courier order). */
  | "delivery_type_changed";

/** The body of a delivery-choice refusal. */
export interface DeliveryChoiceRefusalDTO {
  code: DeliveryChoiceRefusalCode;
  /** The options as they stand now. Absent on `slot_required` when no slot was sent. */
  quote?: DeliveryQuoteDTO | null;
}
