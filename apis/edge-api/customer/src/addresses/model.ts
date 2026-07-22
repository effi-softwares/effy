import type { AddressDTO } from "@effy/shared-types";

/**
 * The address book — customer profile management on the COLD path (edge-api/customer), per the
 * routing law (011 FR-028: customer profile/account → cold path). The address CRUD was originally
 * built on the hot path alongside 019's checkout; 022 moved the *management* surface here, where
 * customer-profile capability belongs. Checkout still reads `public.customer_address` directly for
 * its order snapshot — that is checkout data access on the hot path, not an address-book API.
 *
 * Raw SQL, no ORM (Principle VI). The row is a wire shape and never leaks past this layer.
 */
export interface AddressRow {
  id: string;
  label: string | null;
  recipient_name: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postal_code: string;
  country: string;
  is_default: boolean;
}

/** Every column the repository returns — one list, referenced by every statement. */
export const ADDRESS_COLUMNS = `id::text, label, recipient_name, phone, line1, line2,
          city, region, postal_code, country, is_default`;

export function toDTO(row: AddressRow): AddressDTO {
  return {
    id: row.id,
    label: row.label,
    recipientName: row.recipient_name,
    phone: row.phone,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    region: row.region,
    postalCode: row.postal_code,
    country: row.country,
    isDefault: row.is_default,
  };
}
