/**
 * Delivery — customer-facing contracts (047-delivery-shipping-engine).
 *
 * Contract: `specs/047-delivery-shipping-engine/contracts/delivery-customer-api.contract.md`.
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
 * The two delivery methods. ⚠ Since 077 the method has no price of its own: the fee is ONE amount
 * for the order, and a delivery today costs more only through the plan's window surcharge.
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
 * One method a package can have.
 *
 * ⚠ `feeAmount` IS COMPATIBILITY ONLY since 077. Delivery is priced once per order
 * (`DeliveryQuoteDTO.standardFee`, `DeliverySlotOptionDTO.fee`); these per-package figures are an
 * arrangement that makes a client built before 077 — which sums the chosen method per package —
 * show no less than it is charged. They mean nothing about any one package. Removed by the
 * checkout feature (E5).
 */
export interface DeliveryOptionDTO {
  method: DeliveryMethod;
  feeAmount: string;
  promisedFrom: string | null; // ISO date (yyyy-mm-dd) or null
  promisedTo: string | null;
}

/**
 * One portion of the order and the methods it can have. `shopRef` is an OPAQUE handle — never a shop
 * id (FR-033). A served package ALWAYS carries a `standard` option (FR-029); `same_day` appears only
 * where it can go today (FR-044). ⚠ Not priced: see `DeliveryOptionDTO.feeAmount`.
 */
export interface DeliveryPackageDTO {
  shopRef: string;
  options: DeliveryOptionDTO[];
}

/**
 * The delivery quote shown at checkout, captured server-side so the order is honoured at the quoted fee —
 * the client never sends a fee (FR-036). When `serviced` is false there are NO packages and one reason:
 * the postcode is in no served zone (FR-002).
 */
export interface DeliveryQuoteDTO {
  postcode: string;
  serviced: boolean;
  /**
   * 076 — who delivers to this address. `none` ⇔ not serviced. ⚠ `courier` is returned only when a
   * courier order can be placed (079): the new delivery model is on, courier delivery is on, a
   * courier fee table is active and an estimate is set. The quote then carries `courier`.
   */
  coverage?: CoverageKind;
  /**
   * ISO datetime with the Australia/Melbourne offset, or null. ⚠ Kept for clients built before 069;
   * it now carries the latest OPEN SLOT's cutoff. New clients read `sameDaySlots`.
   */
  sameDayAvailableUntil: string | null;
  packages: DeliveryPackageDTO[];
  expiresAt: string;
  /**
   * 069 — the same-day time slots still open for THIS order, earliest first. Empty when there are
   * none, and then no package carries a `same_day` option. A slot is offered only if it is open for
   * every package that would go same-day, so one choice covers the order (FR-005).
   */
  sameDaySlots: DeliverySlotOptionDTO[];
  /**
   * 069 — why same-day is not offered, when it is not (FR-004). The two are different sentences to a
   * customer: "not in your area" will still be true tomorrow; "today's times are taken" will not.
   */
  sameDayUnavailableReason: SameDayUnavailableReason | null;
  /**
   * 069 — the days a standard delivery can arrive, earliest first. The first is the default.
   * ⚠ Never empty when `serviced` (FR-020) — while `effyWindows` is null.
   */
  standardDays: StandardDayOptionDTO[];
  /** 074 — the customer's spendable points, when they have any. */
  points?: CheckoutPointsDTO;
  /**
   * 077 — the delivery charge for the order when NO window is chosen (a standard day). Absent when
   * not serviced, and from a server older than 077.
   */
  standardFee?: DeliveryFeeDTO;
  /**
   * 077 — how much more the basket needs for free delivery. Null when no free-delivery amount is
   * set or it is already reached.
   */
  freeDeliveryRemainingAmount?: string | null;
  /**
   * 078 — the windows a customer may choose once the new delivery model is on: today's under
   * "Same-day delivery", the following delivery days' under "Standard delivery". ⚠ ABSENT WHILE THE MODEL IS OFF — the response is then byte for byte what
   * it was, and every field above means what it did. When present, the choice is sent back as `deliveryWindow` on the intent, and `standardDays`
   * may be empty.
   */
  effyWindows?: EffyWindowsDTO | null;
  /**
   * 079 — PRESENT EXACTLY WHEN `coverage` is `"courier"`. There is then nothing to choose:
   * `packages`, `sameDaySlots` and `standardDays` are empty and `effyWindows` is absent. The client
   * shows "Courier delivery", the estimate and the fee, and sends `deliveryType: "courier"` on the
   * intent. ⚠ No distance, no courier company, nothing about how many suppliers fill the order.
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

/** Why same-day is not on offer: the zone or shop does not do it, or every slot today is closed or full. */
export type SameDayUnavailableReason = "not_eligible" | "slots_closed";

/**
 * One open same-day delivery window (069).
 *
 * ⚠ 077 REVERSED "a slot has no fee": the order's delivery charge with THIS window is `fee`, and
 * what the window adds over a standard day is `surchargeAmount` — shown before it is chosen.
 * ⚠ NO CAPACITY and no remaining count: how full a slot is is Effy's operational business, and
 * "2 left" would be a pressure tactic nobody asked for (FR-050).
 */
export interface DeliverySlotOptionDTO {
  /** Opaque. Sent back as `sameDaySlotId` on the intent request (`deliveryWindow.slotId` once `effyWindows` is present). */
  slotId: string;
  /** The delivery day, yyyy-mm-dd (Melbourne). */
  date: string;
  /** ISO datetimes with the Australia/Melbourne offset. */
  startAt: string;
  endAt: string;
  /** After this the slot can no longer be chosen. Lets a client grey it out without a round trip. */
  cutoffAt: string;
  /** 077 — what this window adds to the delivery charge; "0.00" when nothing. */
  surchargeAmount?: string;
  /** 077 — the order's delivery charge with this window chosen. */
  fee?: DeliveryFeeDTO;
}

/** One day a standard delivery can arrive (069). Its charge is the quote's `standardFee` (077). */
export interface StandardDayOptionDTO {
  /** yyyy-mm-dd (Melbourne). */
  date: string;
}

/**
 * 069 — why a checkout intent was refused over the delivery choice. Carried as `code` on a 409
 * problem, with a fresh `quote` so the client can re-offer without a second request.
 *
 * ⚠ A refusal NEVER substitutes a slot, a day or a method (FR-010). The customer chooses again.
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
