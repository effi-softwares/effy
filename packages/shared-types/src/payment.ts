/**
 * Payment contracts — 051-customer-payment-experience.
 *
 * The shapes behind the payment step and the account payment-methods screen. Two rules govern
 * everything here, and both are enforced by what this file does NOT declare:
 *
 *  1. ⚠ **No card data crosses this boundary, ever** (FR-025 / SC-012). There is no field for a card
 *     number, a security code or a cardholder name, and none may be added. `last4` is the only part of
 *     a card number permitted to leave the provider.
 *  2. ⚠ **The provider customer reference never reaches a client** (data-model § 1). It identifies a
 *     provider record; no surface has any use for it, so it appears in no response type below.
 *
 * See specs/051-customer-payment-experience/{data-model.md,contracts/payment.contract.md}.
 */

import type { WireInt } from "./cart";

/**
 * A card the shopper explicitly chose to keep.
 *
 * ⚠ NEVER PERSISTED BY EFFY. This is read live from the provider at the moment it is needed, because a
 * mirrored copy rots: a card removed at the provider, expired, or replaced by the issuer's auto-updater
 * would keep being offered from a stale row (data-model § 2).
 */
export interface PaymentMethodDTO {
  /** Provider payment-method reference. Opaque — never parse it. */
  id: string;
  /** Network, for the mark and the label (e.g. "visa", "mastercard", "amex"). */
  brand: string;
  /** The ONLY part of a card number that may leave the provider. */
  last4: string;
  /**
   * ⚠ WireInt, not number. Kotlin serialises a plain `number` as `Double`, so the wire carries `4.0`
   * and Go's encoding/json refuses it into an `int` — the defect that silently rejected every mobile
   * cart write in 019 and took three stacked fixes to find (027 R13). The `@asType integer` annotation
   * is what makes the generated Kotlin an `Int`.
   */
  expMonth: WireInt;
  expYear: WireInt;
  /** Which card the payment step pre-selects (FR-022). */
  isDefault: boolean;
  /**
   * ⚠ SERVER-COMPUTED (FR-023). The client must NOT infer this from the expiry — the rules for what
   * counts as unusable belong in one place, and a client that decides for itself will disagree with the
   * server the moment those rules change.
   */
  usable: boolean;
  /** Why the card cannot be used, when it cannot. Stated, never left for the shopper to work out. */
  unusableReason: string | null;
}

/** GET /v1/payment-methods — the shopper's kept cards. */
export interface ListPaymentMethodsResponse {
  /**
   * ⚠ An empty array means "this shopper has no kept cards" and NOTHING ELSE. A provider outage MUST
   * surface as an error rather than as `[]` — "you have no cards" and "we could not ask" are different
   * facts, and conflating them is the FR-036 failure mode (contract § 2).
   */
  paymentMethods: PaymentMethodDTO[];
}

/**
 * The billing details Effy supplies on the shopper's behalf at confirmation.
 *
 * ⚠ This is why the payment step no longer asks for a country, a postcode or a name. The platform
 * already holds a verified billing address (the order's snapshot — the delivery address where the
 * shopper did not diverge, the chosen billing address where they did) and the profile name, so it sends
 * them itself instead of letting the provider guess a country from the shopper's IP — which is exactly
 * where the reported "Country: Sri Lanka" on an Australia-only storefront came from (research R4).
 *
 * ⚠ DERIVED, NEVER ACCEPTED. A `billingDetails` key in a REQUEST must be ignored: honouring one would
 * let a client contradict the address it confirmed one screen earlier (contract § 1).
 */
export interface BillingDetailsDTO {
  name: string | null;
  email: string | null;
  address: BillingAddressDTO;
}

export interface BillingAddressDTO {
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  /** ISO-3166 alpha-2, capitalised. Always "AU" while Effy sells in one country (spec § Assumptions). */
  country: string;
}
