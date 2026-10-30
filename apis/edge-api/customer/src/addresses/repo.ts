import { query, withTransaction } from "@effy/edge-shared";
import type { DeliveryInstructionsDTO } from "@effy/shared-types";

import { ADDRESS_COLUMNS, type AddressRow } from "./model";

/**
 * Every statement is scoped by the resolved internal customer id, never a client value. The first
 * address becomes the default; a partial unique index allows at most one.
 */

export interface AddressInput {
  label: string | null;
  recipientName: string | null;
  phone: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  makeDefault: boolean;
  /** `undefined` leaves the saved default alone; a value, even both parts null, sets exactly that (null clears). */
  defaultDeliveryInstructions?: DeliveryInstructionsDTO;
}

export async function listByCustomer(customerId: string): Promise<AddressRow[]> {
  const res = await query<AddressRow>(
    `SELECT ${ADDRESS_COLUMNS}
       FROM public.customer_address
      WHERE customer_id = $1
      ORDER BY is_default DESC, created_at ASC`,
    [customerId],
  );
  return res.rows;
}

/** Default when requested or when it is the first; clears any prior default in the same statement. */
export async function create(customerId: string, input: AddressInput): Promise<AddressRow> {
  const res = await query<AddressRow>(
    `WITH mkdefault AS (
        SELECT ($2 OR NOT EXISTS (SELECT 1 FROM public.customer_address WHERE customer_id = $1)) AS v
     ),
     cleared AS (
        UPDATE public.customer_address SET is_default = false
         WHERE customer_id = $1 AND (SELECT v FROM mkdefault)
     )
     INSERT INTO public.customer_address
        (customer_id, label, recipient_name, phone, line1, line2, city, region, postal_code, country, is_default,
         default_delivery_handover, default_delivery_note)
     VALUES ($1, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, 'AU'), (SELECT v FROM mkdefault), $12, $13)
     RETURNING ${ADDRESS_COLUMNS}`,
    [
      customerId,
      input.makeDefault,
      input.label,
      input.recipientName,
      input.phone,
      input.line1,
      input.line2,
      input.city,
      input.region,
      input.postalCode,
      input.country,
      input.defaultDeliveryInstructions?.handover ?? null,
      input.defaultDeliveryInstructions?.note ?? null,
    ],
  );
  const row = res.rows[0];
  if (!row) throw new Error("addresses: create returned no row");
  return row;
}

/**
 * COALESCE keeps omitted fields; null when the id is not the customer's. Promoting to default is two
 * ordered statements in one transaction: `customer_address_default_uq` is not deferrable, and a single
 * CTE would see both rows as default (23505).
 */
export async function update(
  customerId: string,
  id: string,
  input: AddressInput,
): Promise<AddressRow | null> {
  return withTransaction(async (client) => {
    if (input.makeDefault) {
      // Only when the target is the customer's, or a 404 patch would wipe the existing default.
      await client.query(
        `UPDATE public.customer_address SET is_default = false
          WHERE customer_id = $1 AND is_default AND id <> $2
            AND EXISTS (SELECT 1 FROM public.customer_address WHERE id = $2 AND customer_id = $1)`,
        [customerId, id],
      );
    }
    const res = await client.query<AddressRow>(
      `UPDATE public.customer_address SET
          label          = COALESCE($3, label),
          recipient_name = COALESCE($4, recipient_name),
          phone          = COALESCE($5, phone),
          line1          = COALESCE($6, line1),
          line2          = COALESCE($7, line2),
          city           = COALESCE($8, city),
          region         = COALESCE($9, region),
          postal_code    = COALESCE($10, postal_code),
          country        = COALESCE($11, country),
          is_default     = CASE WHEN $2 = true THEN true ELSE is_default END,
          -- Keyed on PRESENCE ($13), not COALESCE - a present null must clear the saved default.
          default_delivery_handover = CASE WHEN $13::boolean THEN $14 ELSE default_delivery_handover END,
          default_delivery_note     = CASE WHEN $13::boolean THEN $15 ELSE default_delivery_note END,
          updated_at     = now()
        WHERE id = $12 AND customer_id = $1
        RETURNING ${ADDRESS_COLUMNS}`,
      [
        customerId,
        input.makeDefault,
        input.label,
        input.recipientName,
        input.phone,
        input.line1,
        input.line2,
        input.city,
        input.region,
        input.postalCode,
        input.country,
        id,
        input.defaultDeliveryInstructions !== undefined,
        input.defaultDeliveryInstructions?.handover ?? null,
        input.defaultDeliveryInstructions?.note ?? null,
      ],
    );
    return res.rows[0] ?? null;
  });
}

export type DeleteOutcome = "deleted" | "not_found" | "default_blocked";

/** Refuses to delete the default while others remain, in one statement so a racing device cannot slip past. */
export async function remove(customerId: string, id: string): Promise<DeleteOutcome> {
  const res = await query<{ existed: string; deleted: string }>(
    `WITH target AS (
        SELECT is_default,
               (SELECT count(*) FROM public.customer_address WHERE customer_id = $2) AS total
          FROM public.customer_address
         WHERE id = $1 AND customer_id = $2
     ),
     del AS (
        DELETE FROM public.customer_address
         WHERE id = $1 AND customer_id = $2
           AND NOT (COALESCE((SELECT is_default FROM target), false) AND COALESCE((SELECT total FROM target), 0) > 1)
        RETURNING id
     )
     SELECT (SELECT count(*) FROM target) AS existed, (SELECT count(*) FROM del) AS deleted`,
    [id, customerId],
  );
  const existed = Number(res.rows[0]?.existed ?? 0);
  const deleted = Number(res.rows[0]?.deleted ?? 0);
  if (existed === 0) return "not_found";
  if (deleted === 0) return "default_blocked";
  return "deleted";
}
