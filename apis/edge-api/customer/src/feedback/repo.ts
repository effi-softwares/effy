import { query } from "@effy/edge-shared"
import type { FeedbackCategory, FeedbackPlatform, FeedbackSource } from "@effy/shared-types"

/**
 * The feedback repository (046 US1). Raw SQL, no ORM (Principle VI).
 *
 * ⚠ THE RATE LIMIT AND THE INSERT ARE ONE STATEMENT. A `COUNT` followed by an `INSERT` is a
 * read-then-write race — two rapid submissions from one source would each see a count below the cap
 * and both write. The conditional `INSERT … SELECT … WHERE (SELECT count …) < $max` decides atomically
 * (the newsletter `ON CONFLICT` lesson applied to a table with no natural conflict key): zero rows
 * RETURNED means the cap was hit, which is a normal outcome, not an error.
 */

export interface InsertSubmissionInput {
  referenceCode: string
  category: FeedbackCategory
  message: string
  rating: number | null
  submitterName: string | null
  submitterEmail: string | null
  emailVerified: boolean
  customerId: string | null
  source: FeedbackSource
  platform: FeedbackPlatform
  /** The hashed rate-limit source (never the raw IP). */
  sourceKey: string
  windowMinutes: number
  maxPerWindow: number
}

export type InsertSubmissionResult =
  | { status: "ok"; referenceCode: string }
  | { status: "rate_limited" }

export async function insertSubmission(input: InsertSubmissionInput): Promise<InsertSubmissionResult> {
  const res = await query<{ reference_code: string }>(
    `
    INSERT INTO public.feedback_submission
      (reference_code, category, message, rating, submitter_name, submitter_email,
       email_verified, customer_id, source, platform, source_key)
    SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
    WHERE (
      SELECT count(*) FROM public.feedback_submission
       WHERE source_key = $11
         AND created_at > now() - make_interval(mins => $12::int)
    ) < $13
    RETURNING reference_code
    `,
    [
      input.referenceCode,
      input.category,
      input.message,
      input.rating,
      input.submitterName,
      input.submitterEmail,
      input.emailVerified,
      input.customerId,
      input.source,
      input.platform,
      input.sourceKey,
      input.windowMinutes,
      input.maxPerWindow,
    ],
  )

  // ⚠ Zero rows is the rate-limit outcome, not a failure — the WHERE simply refused to insert.
  return res.rows.length > 0
    ? { status: "ok", referenceCode: res.rows[0]!.reference_code }
    : { status: "rate_limited" }
}

/** The trusted identity for a signed-in submitter — used to link the row and take the verified email. */
export interface CustomerIdentity {
  id: string
  email: string
  givenName: string | null
  familyName: string | null
}

export async function findCustomerBySub(cognitoSub: string): Promise<CustomerIdentity | null> {
  const res = await query<{
    id: string
    email: string
    given_name: string | null
    family_name: string | null
  }>(
    `SELECT id, email, given_name, family_name
       FROM public.customer
      WHERE cognito_sub = $1`,
    [cognitoSub],
  )
  const row = res.rows[0]
  return row
    ? { id: row.id, email: row.email, givenName: row.given_name, familyName: row.family_name }
    : null
}
