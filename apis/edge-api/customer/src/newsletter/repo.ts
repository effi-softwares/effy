import { query } from "@effy/edge-shared"

/**
 * The newsletter subscriber repository (039 US6). Raw SQL, no ORM (Principle VI).
 *
 * ⚠ EVERY DECISION HERE IS MADE INSIDE ONE STATEMENT. Both operations are read-then-write races if
 * split — "is this address known?" then "insert it", "is this token valid?" then "confirm it" — and
 * two concurrent submissions of the same address would produce two confirmation emails, or two rows.
 * The check and the write are therefore never separated; `ON CONFLICT` and a `WHERE` on the UPDATE do
 * the deciding, and the RETURNING clause reports what actually happened. This is 027's `FOR UPDATE`
 * lesson applied to a smaller table.
 */

export interface UpsertResult {
  /**
   * Whether a confirmation email is due — i.e. the row is `pending` AND no email has gone out inside
   * the cooldown. **This is the whole of FR-035's abuse resistance**: `false` means a repeat submission
   * silently sent nothing.
   */
  sendDue: boolean
}

/**
 * Record interest in `email`, rotating the confirm token only when a send is actually due.
 *
 * ⚠ THE PREDICATE IS KEYED ON `confirm_sent_at`, NEVER `updated_at`. `updated_at` bumps on every write
 * including the no-op this performs for a repeat submission, so a window keyed on it would reset itself
 * on each attempt and cap nothing at all. (research R4 originally said `updated_at` and was corrected.)
 *
 * ⚠ A `confirmed` row is left completely alone — no token rotation, no email, no error. Re-subscribing
 * an already-confirmed address is a no-op, and the caller returns the same uniform success either way
 * (FR-032).
 */
export async function upsertSubscriber(input: {
  email: string
  tokenHash: string
  cooldownMinutes: number
}): Promise<UpsertResult> {
  const res = await query<{ send_due: boolean }>(
    `
    INSERT INTO public.newsletter_subscriber (email, status, confirm_token_hash, confirm_sent_at)
    VALUES ($1, 'pending', $2, now())
    ON CONFLICT (email) DO UPDATE
       SET confirm_token_hash = $2,
           confirm_sent_at    = now(),
           updated_at         = now()
     WHERE newsletter_subscriber.status = 'pending'
       AND (newsletter_subscriber.confirm_sent_at IS NULL
            OR newsletter_subscriber.confirm_sent_at < now() - make_interval(mins => $3::int))
    RETURNING true AS send_due
    `,
    [input.email, input.tokenHash, input.cooldownMinutes],
  )

  // ⚠ ZERO ROWS IS THE NORMAL, EXPECTED OUTCOME OF A SUPPRESSED RESEND, not an error. `ON CONFLICT DO
  // UPDATE … WHERE <false>` returns nothing at all, which is precisely how "already confirmed" and
  // "inside the cooldown" report themselves. Treating an empty result as a failure here would turn the
  // rate limit into a 500 and tell the visitor something was wrong when the system worked perfectly.
  return { sendDue: res.rows.length > 0 }
}

/**
 * Confirm a pending subscription from its token hash.
 *
 * ⚠ SINGLE-USE BY CONSTRUCTION. The UPDATE clears `confirm_token_hash`, so the same token cannot match
 * twice — there is no "already used" flag to check and therefore no window between checking it and
 * acting on it.
 *
 * ⚠ THE TTL IS ENFORCED IN THE `WHERE`, not in the service. An expired token and a wrong token take the
 * identical path and produce the identical result, which is what keeps the confirm endpoint from
 * distinguishing "that token existed but lapsed" from "that token never existed".
 */
export async function confirmSubscriber(input: {
  tokenHash: string
  ttlHours: number
}): Promise<{ confirmed: boolean }> {
  const res = await query<{ id: string }>(
    `
    UPDATE public.newsletter_subscriber
       SET status             = 'confirmed',
           confirmed_at       = now(),
           confirm_token_hash = NULL,
           updated_at         = now()
     WHERE confirm_token_hash = $1
       AND status             = 'pending'
       AND confirm_sent_at    > now() - make_interval(hours => $2::int)
    RETURNING id
    `,
    [input.tokenHash, input.ttlHours],
  )

  return { confirmed: res.rows.length > 0 }
}
