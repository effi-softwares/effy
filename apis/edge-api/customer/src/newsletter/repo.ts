import { query } from "@effy/edge-shared"

/** Every decision is made inside one statement (`ON CONFLICT`, a where on the UPDATE); RETURNING says what happened. */

export interface UpsertResult {
  /** Pending and no email inside the cooldown. `false` means a repeat silently sent nothing. */
  sendDue: boolean
}

/**
 * Rotates the token only when a send is due. Keyed on `confirm_sent_at`, never `updated_at` (which
 * bumps on every write). A confirmed row is left alone.
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

  // Zero rows is the normal result of a suppressed resend, not an error.
  return { sendDue: res.rows.length > 0 }
}

/** Single use: the UPDATE clears the hash. The TTL is in the where, so expired and wrong tokens behave the same. */
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
