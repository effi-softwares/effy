/**
 * Delivery-address contracts — 019-customer-commerce-flow.
 *
 * A customer's delivery addresses (public.customer_address). The chosen address is SNAPSHOT onto the
 * order at placement (R13), so these mutable rows never corrupt a historical receipt.
 *
 * Data design: see specs/019-customer-commerce-flow/data-model.md §2.1 / §3.
 */

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
}
