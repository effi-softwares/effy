import type { AddressDTO, CoverageKind, HandoverPreference } from "@effy/shared-types";

/** The address book. Checkout reads `public.customer_address` directly for its order snapshot. */
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
  /** Prefilled at checkout. Both null means none saved. */
  default_delivery_handover: HandoverPreference | null;
  default_delivery_note: string | null;
  /** Who delivers there now, computed by the reading statement; never a column. */
  coverage: CoverageKind;
}

/**
 * One column list for every statement. `coverage` asks the deciding function as the row is read, so
 * it is always today's answer, never the one from the day the address was saved.
 */
export const ADDRESS_COLUMNS = `id::text, label, recipient_name, phone, line1, line2,
          city, region, postal_code, country, is_default,
          default_delivery_handover, default_delivery_note,
          (SELECT c.kind FROM public.coverage_for_postcode(btrim(postal_code)) c) AS coverage`;

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
    coverage: row.coverage,
    // null, never an empty object, when nothing is saved.
    defaultDeliveryInstructions:
      row.default_delivery_handover === null && row.default_delivery_note === null
        ? null
        : { handover: row.default_delivery_handover, note: row.default_delivery_note },
  };
}
