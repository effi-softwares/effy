import { query } from "@effy/edge-shared"

import { CUSTOMER_COLUMNS, type CustomerRow } from "./model"

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
 *
 * ⚠ `has_password` IS ABSENT FROM THE `DO UPDATE` TOO, AND FOR A RELATED REASON (012).
 * It is seeded ONCE, on the creating INSERT, from `seedHasPassword` — and thereafter it is written
 * ONLY by the platform's own password endpoints. Refreshing it from a client-supplied hint on every
 * request would let a customer flip their own password state at will, and so choose which password
 * flow they are offered. That is not a takeover (see below), but it would corrupt the record — and
 * the record is meant to be the authority.
 */
export async function upsertCustomer(input: {
  cognitoSub: string
  email: string
  givenName: string | null
  familyName: string | null
  /**
   * The registration-route hint (012 FR-013). Applied ONLY on the creating INSERT.
   *
   * ⚠ THIS IS CLIENT-ASSERTED AND THEREFORE UNTRUSTED — so it deserves an argument rather than a
   * shrug, because "untrusted input decides a security-adjacent flag" is normally a smell. Lying in
   * EITHER direction grants the liar NOTHING:
   *
   *   • "I have a password" (but you don't) → the page offers CHANGE, which demands a current
   *     password that does not exist. Cognito refuses. You are merely stuck, and you recover via
   *     "forgot password". No capability gained.
   *
   *   • "I have no password" (but you do)   → the page offers SET, which demands a FRESH CODE sent
   *     to the account's verified email. Anyone who can read that inbox CAN ALREADY reset the
   *     password via recovery. No capability gained.
   *
   * So this is a UX HINT, never an authorization input. The real gates are the emailed code
   * (FR-017) and the current password (FR-016), and Cognito enforces both regardless of what this
   * column claims. It is the constitution's own distinction, one level down: the claim is the
   * ORIGIN, the record is the AUTHORITY.
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
            -- captured at registration and is then the CUSTOMER'S to change (FR-026). Refreshing it
            -- from the token on every request would SILENTLY REVERT an edit made on the account page
            -- the moment the customer loaded any other page — the token still carries whatever
            -- Cognito was told at sign-up. The claim SEEDS the record once; the record is the
            -- authority thereafter.
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

/** Update only what is the customer's to change (FR-026). */
export async function updateName(
  cognitoSub: string,
  givenName: string | null,
  familyName: string | null,
): Promise<CustomerRow | null> {
  const res = await query<CustomerRow>(
    `UPDATE public.customer
        SET given_name  = $2,
            family_name = $3,
            updated_at  = now()
      WHERE cognito_sub = $1
      RETURNING ${CUSTOMER_COLUMNS}`,
    [cognitoSub, givenName, familyName],
  )
  return res.rows[0] ?? null
}

/**
 * Record that a password now exists (012 FR-013).
 *
 * THE AUTHORITATIVE WRITE — the platform performed the password operation itself, so it knows. Called
 * by set-password, change-password, and recovery-confirm. By nothing else.
 */
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
 * The same write, keyed on EMAIL rather than `sub` — for the recovery-confirm path (FR-022b).
 *
 * ⚠ KEYED ON EMAIL ONLY BECAUSE RECOVERY IS UNAUTHENTICATED: there is no token, therefore no `sub`.
 * It is safe here because Cognito has already verified the emailed code before this line is reached
 * — the caller has proven they hold the inbox.
 *
 * ⚠ DO NOT COPY THIS PATTERN anywhere a `sub` is available. Everything else in the platform keys on
 * `cognito_sub` deliberately: a customer who can change their own email must not be able to walk
 * onto another customer's row. 011's migration says so at length, and it is right.
 *
 * `citext` makes the match case-insensitive, matching Cognito's own treatment of email.
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

/** The record, or null. The password endpoints gate on `status` and `has_password` from this. */
export async function findByCognitoSub(cognitoSub: string): Promise<CustomerRow | null> {
  const res = await query<CustomerRow>(
    `SELECT ${CUSTOMER_COLUMNS} FROM public.customer WHERE cognito_sub = $1`,
    [cognitoSub],
  )
  return res.rows[0] ?? null
}
