/**
 * A customer's delivery addresses (public.customer_address). The chosen address is snapshotted onto the
 * order at placement, so editing one never changes a receipt.
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
  /** Who delivers to this address today: decided when read, never saved with it. */
  coverage?: CoverageKind;
  /** The instructions this address prefills at checkout, or null. A placed order never reads this. */
  defaultDeliveryInstructions?: DeliveryInstructionsDTO | null;
}

/** POST /v1/addresses - the first address created becomes the default. */
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
  /** On update the key's presence is read: absent leaves the default, `null` clears it, a value replaces it. */
  defaultDeliveryInstructions?: DeliveryInstructionsDTO | null;
}

/** PATCH /v1/addresses/{id} - partial update / set default. */
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
  /** On update the key's presence is read: absent leaves the default, `null` clears it, a value replaces it. */
  defaultDeliveryInstructions?: DeliveryInstructionsDTO | null;
}
