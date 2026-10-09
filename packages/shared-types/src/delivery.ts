/**
 * Delivery — customer-facing contracts (047, rebuilt by 076–079; the old same-day/standard
 * checkout fields were removed by 083).
 *
 * The SSOT the backend (serviceability, localities, quote), customer-web, and customer-mobile all
 * consume (Principle II). ⚠ Money crosses the wire as a 2-dp decimal string (like every other amount on
 * the platform, e.g. `CartLineDTO.unitPriceAmount`) — never a float and never cents-as-number, which is
 * what the backend↔mobile wire-contract test exists to keep honest (research R14; 027 R13).
 *
 * ⚠ Nothing here ever carries a distance, a band, a weight, a fee plan or a shop identity (047
 * FR-018/FR-033; 077 FR-032). The delivery fee is lines and a total — see `delivery-fee.ts`.
 */

import type { CheckoutPointsDTO } from "./checkout";
import type { DeliveryFeeDTO, DeliveryOfferDTO } from "./delivery-fee";

/**
 * The customer's two words for WHEN an Effy order arrives: `same_day` = a window today, `standard` =
 * a window on a later day (078). ⚠ No price of its own (077): the fee is ONE amount for the order.
 * ⚠ On an order placed before delivery types (079) `standard` meant a day a carrier delivered —
 * such an order is read through `deliveredBy`, never guessed from this word.
 */
export type DeliveryMethod = "same_day" | "standard";

/**
 * 076 — WHO delivers to an address. The one answer every surface gives (FR-019/FR-020):
 *   effy     the postcode is on Effy's list — Effy's own drivers deliver
 *   courier  not on the list, and courier delivery is offered there
 *   none     neither reaches it
 *
 * ⚠ Decided in ONE place — the database function `public.coverage_for_postcode` — at the moment of
 * asking, and never stored against an address (FR-021).
 * ⚠ A customer contract carries this value and NOTHING about why: no group, no distance, no reason,
 * no hub (FR-023). Staff contracts are in `delivery-admin.ts`.
 */
export type CoverageKind = "effy" | "courier" | "none";

/**
 * ⚠ THE ONLY PLACE THESE WORDS ARE WRITTEN (FR-022, SC-004). Every server response and every
 * customer screen — web and mobile, address book and checkout — renders these constants. Before 076
 * the refusal existed twice, worded differently; `coverage.guard.test.ts` fails if it does again.
 */
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
 * The single serviceability decision (FR-001), answered before a cart exists and again at checkout by the
 * SAME predicate (FR-004). ⚠ No zone id, name, fee, or window may be added.
 */
export interface ServiceabilityDTO {
  postcode: string;
  /** Kept for clients released before 076. Always `coverage !== "none"`. */
  serviced: boolean;
  /** 076 — who delivers. Absent only from a server older than 076. */
  coverage?: CoverageKind;
  /**
   * 077 — the basket offer, when Effy delivers here. Absent for `courier` and `none`, and from a
   * server older than 077. ⚠ An offer, never a fee: the fee needs the basket and the window.
   */
  offer?: DeliveryOfferDTO;
}

/** One place, fully identified — the only selectable unit (FR-007). */
export interface LocalityDTO {
  name: string;
  state: AustralianState;
  postcode: string;
}

/** The locality typeahead result (030): ≤ 8, alphabetical, never ordered by serviceability. */
export interface LocalitiesResultDTO {
  items: LocalityDTO[];
}

/**
 * The delivery quote shown at checkout, captured server-side so the order is honoured at the quoted
 * fee — the client never sends a fee (047 FR-036).
 *
 * A serviced address answers exactly one of two things (083): `effyWindows` — the windows to choose
 * from — or `courier`. ⚠ Nothing about how the order splits across suppliers: no package list.
 */
export interface DeliveryQuoteDTO {
  postcode: string;
  serviced: boolean;
  /**
   * 076 — who delivers to this address. `none` ⇔ not serviced. `courier` is returned only when a
   * courier order can be placed (079); the quote then carries `courier`.
   */
  coverage?: CoverageKind;
  /** ISO datetime with the Australia/Melbourne offset; "" when not serviced. */
  expiresAt: string;
  /** 074 — the customer's spendable points, when they have any. */
  points?: CheckoutPointsDTO;
  /**
   * 077 — how much more the basket needs for free delivery. Null when no free-delivery amount is
   * set or it is already reached.
   */
  freeDeliveryRemainingAmount?: string | null;
  /**
   * PRESENT EXACTLY WHEN `coverage` is `"effy"` (078): today's windows under "Same-day delivery",
   * the following delivery days' under "Standard delivery". The choice is sent back as
   * `deliveryWindow` on the intent.
   */
  effyWindows?: EffyWindowsDTO | null;
  /**
   * PRESENT EXACTLY WHEN `coverage` is `"courier"` (079). There is then nothing to choose: the
   * client shows "Courier delivery", the estimate and the fee, and sends `deliveryType: "courier"`
   * on the intent. ⚠ No distance, no courier company, nothing about how many suppliers fill the order.
   */
  courier?: CourierQuoteDTO;
}

/** 079 — what a customer is told and charged when a courier delivers the order. */
export interface CourierQuoteDTO {
  /**
   * The courier's usual timeframe, in the business's words ("2–4 business days"). ⚠ An estimate,
   * never a promise: print it through `courierLines` (`delivery-type.ts`), never on its own.
   */
  estimate: string;
  /** The courier fee for the whole order (077): lines and a total. */
  fee: DeliveryFeeDTO;
  /**
   * `out_of_coverage` — Effy does not deliver to the address. `no_window` — it does, but no window
   * is available on any offered day and the business sends such an order by courier: the client
   * says there are no delivery windows FIRST, then offers this.
   */
  reason: CourierQuoteReason;
}

/** 079 — why a courier delivers this order. Named, so the generated Kotlin enum is too. */
export type CourierQuoteReason = "out_of_coverage" | "no_window";

/**
 * ⚠ THE ONLY PLACE THESE WORDS ARE WRITTEN (078 FR-001a). Web and mobile render these constants;
 * the mobile app's `DeliveryWindowWords.kt` mirrors them and a test holds it to this file.
 *
 * "Standard delivery" kept its name and changed its meaning: from the switch it is Effy, on a later
 * day, in a window — no longer a carrier.
 */
export const DELIVERY_WINDOW_WORDS = {
  sectionSameDay: "Same-day delivery",
  sectionStandard: "Standard delivery",
  todayClosed: "No windows left today.",
  todayNotDeliveryDay: "We don't deliver today.",
  dayFull: "Every window on this day is taken.",
  noWindows: "There are no delivery windows available in the next few days. Please try again later.",
  cutoffPrefix: "Order by",
} as const;

/** Why a day has no window to choose. A later day is only ever "full". */
export type EffyDayClosedReason = "not_delivery_day" | "closed" | "full";

/**
 * 078 — one window on one day.
 *
 * ⚠ NO CAPACITY, no remaining count, and a full window is simply ABSENT (069 FR-050).
 */
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

/** 078 — one day on offer: today (`same_day`) or a following delivery day (`standard`). */
export interface EffyDayDTO {
  date: string;
  section: DeliveryMethod;
  /** Open windows only, earliest first. */
  windows: EffyWindowDTO[];
  /** Why `windows` is empty; null when it is not. */
  closedReason: EffyDayClosedReason | null;
}

export interface EffyWindowsDTO {
  /** Today first, then the next delivery days. Never empty. */
  days: EffyDayDTO[];
  /**
   * Set when no window is open on ANY day: `no_windows` (all closed or taken) or `none_defined`
   * (the business has switched none on). The customer reads `DELIVERY_WINDOW_WORDS.noWindows`.
   */
  unavailable: "no_windows" | "none_defined" | null;
}

/**
 * 069 — why a checkout intent was refused over the delivery choice. Carried as `code` on a 409
 * problem, with a fresh `quote` so the client can re-offer without a second request.
 *
 * ⚠ A refusal NEVER substitutes a window or a day (FR-010). The customer chooses again.
 */
export type DeliveryChoiceRefusalCode =
  | "slot_required" | "slot_unavailable" | "date_unavailable" | "no_windows_available"
  /** 079 — the delivery type the client showed is not the one that applies now (or it sent none for a courier order). */
  | "delivery_type_changed";

/** The body of a delivery-choice refusal. */
export interface DeliveryChoiceRefusalDTO {
  code: DeliveryChoiceRefusalCode;
  /** The options as they stand NOW. Absent on `slot_required` from a client that sent no slot. */
  quote?: DeliveryQuoteDTO | null;
}
