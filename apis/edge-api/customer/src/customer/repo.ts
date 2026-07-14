import { query } from "@effy/edge-shared"

import type { CustomerRow } from "./model"

/**
 * The customer repository. Raw SQL, no ORM (Principle VI).
 */

/**
 * The idempotent just-in-time upsert (FR-023, FR-024).
 *
 * Called on every authenticated request. The FIRST time a customer appears it creates their
 * record; every time after, it finds and reuses it. `ON CONFLICT` makes it safe under CONCURRENT
 * first sign-ins — two simultaneous requests produce one row, not a duplicate and not a crash
 * (SC-007, SC-010).
 *
 * ⚠⚠ READ THIS BEFORE YOU TOUCH THE `DO UPDATE` SET CLAUSE. ⚠⚠
 *
 * `status` is ABSENT from it, deliberately. It is the most important omission in this slice.
 *
 * The tempting "tidy-up" is to write:
 *
 *     ON CONFLICT (cognito_sub) DO UPDATE
 *       SET email = EXCLUDED.email, status = EXCLUDED.status, updated_at = now()
 *
 * That one word would mean A BARRED CUSTOMER UN-BARS THEMSELVES SIMPLY BY SIGNING IN: the INSERT
 * supplies the column default ('active'), the conflict path writes it straight over the ban, and
 * the ban silently evaporates. No error. No log. Nothing to notice. It would defeat FR-025 and
 * SC-011 completely, and it would look like a harmless cleanup in review.
 *
 * `status` is platform-owned. It is written by the platform, never by a sign-in.
 */
export async function upsertCustomer(input: {
  cognitoSub: string
  email: string
  displayName: string | null
}): Promise<CustomerRow> {
  const res = await query<CustomerRow>(
    `INSERT INTO public.customer (cognito_sub, email, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (cognito_sub) DO UPDATE
        SET email      = EXCLUDED.email,   -- the verified email can legitimately change at the IdP
            updated_at = now()
            -- status: NEVER. See the warning above.
     RETURNING id, cognito_sub, email, display_name, status, created_at, updated_at`,
    [input.cognitoSub, input.email, input.displayName],
  )
  return res.rows[0]!
}

/** Update only what is the customer's to change (FR-026). */
export async function updateDisplayName(
  cognitoSub: string,
  displayName: string | null,
): Promise<CustomerRow | null> {
  const res = await query<CustomerRow>(
    `UPDATE public.customer
        SET display_name = $2,
            updated_at   = now()
      WHERE cognito_sub = $1
      RETURNING id, cognito_sub, email, display_name, status, created_at, updated_at`,
    [cognitoSub, displayName],
  )
  return res.rows[0] ?? null
}
