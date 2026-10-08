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
 * ⚠ Nothing here ever carries a distance, a ring name, or a shop identity (FR-018/FR-033; SC-007).
 */

import type { CheckoutPointsDTO } from "./checkout";

/** The two delivery methods. same-day is always priced ≥ standard (FR-022). */
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
 * One offered method for one package, at its GST-inclusive, snapped-up fee (FR-024/032/034).
 * `feeAmount` is a 2-dp decimal string (e.g. "6.00"). The delivery window is advisory copy.
 */
export interface DeliveryOptionDTO {
  method: DeliveryMethod;
  feeAmount: string;
  promisedFrom: string | null; // ISO date (yyyy-mm-dd) or null
  promisedTo: string | null;
}

/**
 * The per-shop portion of the order, priced independently (FR-030). `shopRef` is an OPAQUE handle — never
 * a shop id, so nothing here identifies the fulfilling shop (FR-033). A served package ALWAYS carries a
 * `standard` option (FR-029); `same_day` appears only where the fulfilling shop does same-day in this zone
 * and it is before the cutoff (FR-044).
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
   * 076 — who delivers to this address. `none` ⇔ not serviced. ⚠ `courier` cannot be purchased until
   * the courier checkout exists, and until then the server never returns it here.
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
   * ⚠ Never empty when `serviced` (FR-020).
   */
  standardDays: StandardDayOptionDTO[];
  /** 074 — the customer's spendable points, when they have any. */
  points?: CheckoutPointsDTO;
}

/** Why same-day is not on offer: the zone or shop does not do it, or every slot today is closed or full. */
export type SameDayUnavailableReason = "not_eligible" | "slots_closed";

/**
 * One open same-day delivery window (069).
 *
 * ⚠ NO FEE: a slot has no price of its own — the fee is the same-day METHOD's, read from the
 * package options (FR-021). ⚠ NO CAPACITY and no remaining count: how full a slot is is Effy's
 * operational business, and "2 left" would be a pressure tactic nobody asked for (FR-050).
 */
export interface DeliverySlotOptionDTO {
  /** Opaque. Sent back as `sameDaySlotId` on the intent request. */
  slotId: string;
  /** The delivery day, yyyy-mm-dd (Melbourne). */
  date: string;
  /** ISO datetimes with the Australia/Melbourne offset. */
  startAt: string;
  endAt: string;
  /** After this the slot can no longer be chosen. Lets a client grey it out without a round trip. */
  cutoffAt: string;
}

/** One day a standard delivery can arrive (069). The fee is the standard METHOD's, as above. */
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
export type DeliveryChoiceRefusalCode = "slot_required" | "slot_unavailable" | "date_unavailable";

/** The body of a delivery-choice refusal. */
export interface DeliveryChoiceRefusalDTO {
  code: DeliveryChoiceRefusalCode;
  /** The options as they stand NOW. Absent on `slot_required` from a client that sent no slot. */
  quote?: DeliveryQuoteDTO | null;
}
