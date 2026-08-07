import { createHash, randomBytes } from "node:crypto"

import { logger } from "@effy/edge-shared"
import { sendEmail } from "@effy/email-kit/send"
import type { NewsletterConfirmResult, NewsletterSubscribeResult } from "@effy/shared-types"

import { confirmSubscriber, upsertSubscriber } from "./repo"

/**
 * Newsletter subscribe / confirm (039 US6). Cold path, public, no authorizer.
 *
 * ⚠ WHY A MARKETING ROUTE LIVES IN THE CUSTOMER PROFILE SERVICE (research R1): subscribe is
 * low-frequency, its work is asynchronous email, and `edge-customer` already carries everything it
 * needs — DB access, `ses:SendEmail` scoped to this environment's identity AND configuration set, the
 * full `MAIL_*` environment email-kit reads, and a public-route precedent in `healthz`/`readyz`.
 * Standing up a whole deployable for one endpoint would duplicate all of it. It is NOT commerce, so
 * the hot-path routing law (011 FR-028) is not engaged.
 */

/** Defaults; overridable by env so neither number is a literal buried in a query. */
const DEFAULT_TTL_HOURS = 24
const DEFAULT_COOLDOWN_MINUTES = 60

/**
 * ⚠ A LENGTH BOUND BEFORE ANY WORK. RFC 5321 caps a path at 254 octets; anything longer is not an
 * address, and accepting it would let a caller push arbitrary megabytes through the validator and into
 * a query parameter.
 */
const MAX_EMAIL_LENGTH = 254

/**
 * ⚠ DELIBERATELY PERMISSIVE, and that is the correct trade for a newsletter. A strict RFC 5322 regex
 * is famously ~6 KB long, still wrong, and rejects addresses that genuinely exist. The real validation
 * is the confirmation email itself: an address that cannot receive mail never confirms and never
 * enters the list. This check exists to catch typing mistakes and obvious junk before we do any work.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/

export interface NewsletterConfig {
  confirmBaseUrl: string
  ttlHours: number
  cooldownMinutes: number
}

export function newsletterConfig(env: NodeJS.ProcessEnv = process.env): NewsletterConfig {
  return {
    confirmBaseUrl: env.NEWSLETTER_CONFIRM_BASE_URL ?? "",
    ttlHours: Number(env.NEWSLETTER_TOKEN_TTL_HOURS ?? DEFAULT_TTL_HOURS),
    cooldownMinutes: Number(env.NEWSLETTER_RESEND_COOLDOWN_MINUTES ?? DEFAULT_COOLDOWN_MINUTES),
  }
}

/** Normalised for storage. `citext` handles case; this handles the whitespace people paste in. */
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

/** ⚠ The token is stored ONLY as this hash. A database leak must not confer the ability to confirm. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/**
 * Subscribe.
 *
 * ⚠ THE RESULT IS UNIFORM FOR NEW, PENDING AND CONFIRMED ADDRESSES (FR-032). A distinct
 * "already subscribed" answer is a subscriber-enumeration oracle — anyone could probe an address and
 * learn whether it is on the list — and double opt-in exists precisely to stop this form being used
 * against third parties. There is no code path here that can tell the caller which case occurred.
 */
export async function subscribe(
  rawEmail: unknown,
  config: NewsletterConfig = newsletterConfig(),
): Promise<NewsletterSubscribeResult> {
  if (typeof rawEmail !== "string") return { status: "invalid" }

  const email = normaliseEmail(rawEmail)
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH || !EMAIL_SHAPE.test(email)) {
    // ⚠ No DB call and no email for an invalid address — the one case that IS distinguishable, and
    // safely so: it says nothing about who is subscribed, only that what was typed is not an address.
    return { status: "invalid" }
  }

  const token = randomBytes(32).toString("base64url")

  try {
    const { sendDue } = await upsertSubscriber({
      email,
      tokenHash: hashToken(token),
      cooldownMinutes: config.cooldownMinutes,
    })

    if (sendDue) {
      await sendEmail(
        "newsletter-confirmation",
        {
          confirmUrl: `${config.confirmBaseUrl}?token=${encodeURIComponent(token)}`,
          expiresIn: expiresInWords(config.ttlHours),
        },
        { to: email, audience: "customer" },
        logger,
      )
    }

    // ⚠ Logged WITHOUT the address. The outcome is the operational fact; the subscriber's email is PII
    // and a marketing subscriber is not even an account holder (Principle VII).
    logger.info({ msg: "newsletter.subscribe", sendDue }, "newsletter subscribe handled")

    return { status: "ok" }
  } catch (err) {
    // ⚠ `newsletter-confirmation` declares `onSendFailure: "throw"`, so a failed send lands here. The
    // row may exist while the email did not, which is exactly why the visitor is told to retry rather
    // than told it worked: a retry after the cooldown rotates the token and sends again.
    logger.error({ msg: "newsletter.subscribe_failed", err }, "newsletter subscribe failed")
    return { status: "error" }
  }
}

/**
 * Confirm.
 *
 * ⚠ INVALID, EXPIRED AND ALREADY-USED TOKENS ALL RETURN `expired`. Distinguishing them would confirm
 * that a token existed, which is a small oracle of its own — and there is nothing a holder of a dead
 * token can do differently in any of the three cases anyway.
 */
export async function confirm(
  rawToken: unknown,
  config: NewsletterConfig = newsletterConfig(),
): Promise<NewsletterConfirmResult> {
  if (typeof rawToken !== "string" || rawToken.length === 0 || rawToken.length > 512) {
    return { status: "expired" }
  }

  try {
    const { confirmed } = await confirmSubscriber({
      tokenHash: hashToken(rawToken),
      ttlHours: config.ttlHours,
    })

    logger.info({ msg: "newsletter.confirm", confirmed }, "newsletter confirm handled")
    return { status: confirmed ? "confirmed" : "expired" }
  } catch (err) {
    // ⚠ A failure here reports `expired` rather than throwing: the subscriber can only retry the same
    // dead-looking link either way, and a 500 on a link in an email is a worse experience than a clear
    // "this link has expired" with a way back to the store. The failure is logged loudly.
    logger.error({ msg: "newsletter.confirm_failed", err }, "newsletter confirm failed")
    return { status: "expired" }
  }
}

/** "24 hours" / "2 days" — the words the email uses. Pre-formatted, per email-kit's var rules. */
export function expiresInWords(hours: number): string {
  if (hours % 24 === 0 && hours >= 24) {
    const days = hours / 24
    return days === 1 ? "24 hours" : `${days} days`
  }
  return hours === 1 ? "1 hour" : `${hours} hours`
}
