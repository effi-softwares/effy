/**
 * Delivery-address contracts — 019-customer-commerce-flow.
 *
 * A customer's delivery addresses (public.customer_address). The chosen address is SNAPSHOT onto the
 * order at placement (R13), so these mutable rows never corrupt a historical receipt.
 *
 * Data design: see specs/019-customer-commerce-flow/data-model.md §2.1 / §3.
 */

import type { CoverageKind } from "./delivery";
import type { DeliveryInstructionsDTO } from "./delivery-instructions";

/** A saved delivery address (GET /v1/addresses). */
export interface AddressDTO {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string;
  country: string;
  isDefault: boolean;
  /**
   * 076 — who delivers to this address TODAY: worked out when the address is read, never saved with
   * it, so a postcode that leaves Effy's list changes the answer the next time it is shown.
   */
  coverage?: CoverageKind;
  /**
   * 066 — the instructions this address PREFILLS at checkout, or null. A convenience for the next
   * order only: a placed order stores what its own checkout sent and never reads this.
   */
  defaultDeliveryInstructions?: DeliveryInstructionsDTO | null;
}

/** POST /v1/addresses — the first address created becomes the default. */
export interface CreateAddressRequest {
  label?: string | null;
  recipientName: string;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  region?: string | null;
  postalCode: string;
  country?: string;
  makeDefault?: boolean;
  /**
   * 066 — on UPDATE the key's PRESENCE is what is read: absent leaves the saved default alone,
   * `null` clears it, a value replaces it.
   */
  defaultDeliveryInstructions?: DeliveryInstructionsDTO | null;
}

/** PATCH /v1/addresses/{id} — partial update / set default. */
export interface UpdateAddressRequest {
  label?: string | null;
  recipientName?: string;
  phone?: string | null;
  line1?: string;
  line2?: string | null;
  city?: string;
  region?: string | null;
  postalCode?: string;
  country?: string;
  makeDefault?: boolean;
  /**
   * 066 — on UPDATE the key's PRESENCE is what is read: absent leaves the saved default alone,
   * `null` clears it, a value replaces it.
   */
  defaultDeliveryInstructions?: DeliveryInstructionsDTO | null;
}
