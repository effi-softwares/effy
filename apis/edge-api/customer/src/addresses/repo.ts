import { query } from "@effy/edge-shared";

import { ADDRESS_COLUMNS, type AddressRow } from "./model";

/**
 * The address repository. Raw SQL, no ORM (Principle VI).
 *
 * Every statement is scoped by the resolved INTERNAL customer id (`public.customer.id`), never a
 * client-supplied value — the caller's `sub` is resolved to that id (and gated on `active`) by the
 * service before any of these run (FR-020, SC-005).
 *
 * The first address becomes the default; at most one default per customer (a partial-unique index
 * backs it). Making one default clears the prior default in the same statement (a CTE), so the
 * invariant holds without a read-modify-write race.
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

/**
 * Insert an address. It becomes the default when explicitly requested OR it is the customer's first
 * address; making it default clears any prior default in the same statement.
 */
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
        (customer_id, label, recipient_name, phone, line1, line2, city, region, postal_code, country, is_default)
     VALUES ($1, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, 'AU'), (SELECT v FROM mkdefault))
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
    ],
  );
  // INSERT … RETURNING always yields exactly one row; the guard satisfies strict index typing.
  const row = res.rows[0];
  if (!row) throw new Error("addresses: create returned no row");
  return row;
}

/**
 * Patch provided fields (COALESCE keeps omitted ones) and optionally promote to default. Returns
 * null when the id is not the customer's (→ 404).
 */
export async function update(
  customerId: string,
  id: string,
  input: AddressInput,
): Promise<AddressRow | null> {
  const res = await query<AddressRow>(
    `WITH cleared AS (
        UPDATE public.customer_address SET is_default = false
         WHERE customer_id = $1 AND $2 = true
     )
     UPDATE public.customer_address SET
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
    ],
  );
  return res.rows[0] ?? null;
}

export type DeleteOutcome = "deleted" | "not_found" | "default_blocked";

/**
 * Delete an address, refusing to delete the default while others remain (022 FR-016a). The guard is
 * a single statement — the existence check, the "others remain" count, and the conditional DELETE
 * all resolve in one snapshot, so a racing device cannot slip past it. `existed`/`deleted`
 * disambiguate the three outcomes.
 */
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
