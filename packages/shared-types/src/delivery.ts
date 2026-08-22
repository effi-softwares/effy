/**
 * Delivery — customer-facing contracts (047-delivery-shipping-engine).
 *
 * Contract: `specs/047-delivery-shipping-engine/contracts/delivery-customer-api.contract.md`.
 *
 * The SSOT the Go hot path (serviceability, localities, quote), customer-web, and customer-mobile all
 * consume (Principle II). ⚠ Money crosses the wire as a 2-dp decimal string (like every other amount on
 * the platform, e.g. `CartLineDTO.unitPriceAmount`) — never a float and never cents-as-number, which is
 * what the Go↔Kotlin wire-contract test exists to keep honest (research R14; 027 R13).
 *
 * ⚠ Nothing here ever carries a distance, a ring name, or a shop identity (FR-018/FR-033; SC-007).
 */

/** The two delivery methods. same-day is always priced ≥ standard (FR-022). */
export type DeliveryMethod = "same_day" | "standard";

/** Australian state / territory — the closed set the place record uses. */
export type AustralianState = "ACT" | "NSW" | "NT" | "QLD" | "SA" | "TAS" | "VIC" | "WA";

/**
 * The single serviceability decision (FR-001), answered before a cart exists and again at checkout by the
 * SAME predicate (FR-004). ⚠ Frozen two-field shape — no zone id, name, fee, or window may be added.
 */
export interface ServiceabilityDTO {
  postcode: string;
  serviced: boolean;
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
  sameDayAvailableUntil: string | null; // ISO datetime with the Australia/Melbourne offset, or null
  packages: DeliveryPackageDTO[];
  expiresAt: string;
}
