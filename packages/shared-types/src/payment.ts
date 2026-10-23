/**
 * Payment contracts for the payment step and the account payment-methods screen. No card data crosses
 * this boundary (`last4` is the only part of a number allowed out), and the provider customer
 * reference never reaches a client.
 */

import type { WireInt } from "./cart";

/** A card the shopper chose to keep, read live from the provider when needed and never persisted (a copy would go stale). */
export interface PaymentMethodDTO {
  /** The provider's payment-method reference. Opaque. */
  id: string;
  /** Network, for the mark and the label (e.g. "visa", "mastercard", "amex"). */
  brand: string;
  /** The only part of a card number that may leave the provider. */
  last4: string;
  /** `WireInt`, so the generated Kotlin is an `Int`. */
  expMonth: WireInt;
  expYear: WireInt;
  /** Which card the payment step pre-selects. */
  isDefault: boolean;
  /** Server-computed: the client never infers it from the expiry. */
  usable: boolean;
  /** Why the card cannot be used, when it cannot. */
  unusableReason: string | null;
}

/** GET /v1/payment-methods — the shopper's kept cards. */
export interface ListPaymentMethodsResponse {
  /** Empty means no kept cards and nothing else; a provider outage is an error, never `[]`. */
  paymentMethods: PaymentMethodDTO[];
}

/**
 * The billing details Effy supplies at confirmation, so the payment step asks for no country, postcode
 * or name: the order's billing snapshot (the delivery address, or the chosen billing one) and the
 * profile name. Derived, never accepted: a `billingDetails` key in a request is ignored.
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
  /** ISO-3166 alpha-2. Always "AU" while Effy sells in one country. */
  country: string;
}
