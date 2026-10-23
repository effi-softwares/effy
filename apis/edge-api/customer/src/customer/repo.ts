import { query } from "@effy/edge-shared"

import { CUSTOMER_COLUMNS, type CustomerRow } from "./model"

/**
 * The just-in-time upsert, on every authenticated request; `ON CONFLICT` makes concurrent first
 * sign-ins produce one row. The do UPDATE must never set:
 * - `status`: the INSERT default ('active') would un-bar a barred customer at sign-in;
 * - `closure_state`: the default ('open') would silently un-delete an account (restore is explicit);
 * - `has_password`: seeded once on create, then written only by the password endpoints.
 * `repo.guard.test.ts` checks.
 */
export async function upsertCustomer(input: {
  cognitoSub: string
  email: string
  givenName: string | null
  familyName: string | null
  /**
   * The registration route's hint, applied only on create. Client-asserted, but lying either way gains
   * nothing: the emailed code and the current password are Cognito's gates regardless.
   */
  seedHasPassword?: boolean
}): Promise<CustomerRow> {
  const res = await query<CustomerRow>(
    `INSERT INTO public.customer (cognito_sub, email, given_name, family_name, has_password)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (cognito_sub) DO UPDATE
        SET email      = EXCLUDED.email,   -- the verified email can legitimately change at the IdP
            updated_at = now()
            -- status:       NEVER. See the warning above.
            -- has_password: NEVER. Seeded once on INSERT; thereafter the platform's own password
            --               endpoints are its only writers. A client hint must not be able to
            --               rewrite it on every request.
            -- given_name / family_name: NEVER either, and for a different reason. The name is
            -- captured at registration and is then the CUSTOMER'S to change. Refreshing it
            -- from the token on every request would SILENTLY REVERT an edit made on the account page
            -- the moment the customer loaded any other page — the token still carries whatever
            -- Cognito was told at sign-up. The claim SEEDS the record once; the record is the
            -- authority thereafter.
            -- phone:         NEVER. Same argument as the names — it is the customer's.
            -- closure_state: NEVER, and this is the most dangerous one. See the warning above.
     RETURNING ${CUSTOMER_COLUMNS}`,
    [
      input.cognitoSub,
      input.email,
      input.givenName,
      input.familyName,
      input.seedHasPassword ?? false,
    ],
  )
  return res.rows[0]!
}

/**
 * Only what is the customer's to change. `phone` joins the names here and nowhere else (a token
 * refresh would revert an edit); `closure_state` is never written here.
 */
export async function updateProfile(
  cognitoSub: string,
  givenName: string | null,
  familyName: string | null,
  phone: string | null,
): Promise<CustomerRow | null> {
  const res = await query<CustomerRow>(
    `UPDATE public.customer
        SET given_name  = $2,
            family_name = $3,
            phone       = $4,
            updated_at  = now()
      WHERE cognito_sub = $1
      RETURNING ${CUSTOMER_COLUMNS}`,
    [cognitoSub, givenName, familyName, phone],
  )
  return res.rows[0] ?? null
}

/** The authoritative write, called only by set-password, change-password and recovery-confirm. */
export async function markPasswordSet(cognitoSub: string): Promise<CustomerRow | null> {
  const res = await query<CustomerRow>(
    `UPDATE public.customer
        SET has_password        = true,
            password_updated_at = now(),
            updated_at          = now()
      WHERE cognito_sub = $1
      RETURNING ${CUSTOMER_COLUMNS}`,
    [cognitoSub],
  )
  return res.rows[0] ?? null
}

/**
 * Keyed on email only because recovery is unauthenticated (no `sub`); Cognito has already verified the
 * emailed code. Do not copy this pattern where a `sub` is available. `citext` matches case-insensitively.
 */
export async function markPasswordSetByEmail(email: string): Promise<CustomerRow | null> {
  const res = await query<CustomerRow>(
    `UPDATE public.customer
        SET has_password        = true,
            password_updated_at = now(),
            updated_at          = now()
      WHERE email = $1
      RETURNING ${CUSTOMER_COLUMNS}`,
    [email],
  )
  return res.rows[0] ?? null
}

/** null when absent. The password endpoints gate on `status` and `has_password`. */
export async function findByCognitoSub(cognitoSub: string): Promise<CustomerRow | null> {
  const res = await query<CustomerRow>(
    `SELECT ${CUSTOMER_COLUMNS} FROM public.customer WHERE cognito_sub = $1`,
    [cognitoSub],
  )
  return res.rows[0] ?? null
}
