import { createHash, randomBytes } from "node:crypto"

import { logger } from "@effy/edge-shared"
import { sendEmail } from "@effy/email-kit/send"
import type { NewsletterConfirmResult, NewsletterSubscribeResult } from "@effy/shared-types"
import { EMAIL_MAX_LENGTH, EMAIL_SHAPE } from "@effy/shared-types"

import { confirmSubscriber, upsertSubscriber } from "./repo"

/** Public. Lives here because this service already has DB access, scoped SES and the mail environment. */

/** Overridable by env. */
const DEFAULT_TTL_HOURS = 24
const DEFAULT_COOLDOWN_MINUTES = 60

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

/** `citext` handles case; this handles pasted whitespace. */
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

/** Stored only as this hash, so a database leak cannot confirm anything. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** Uniform for new, pending and confirmed addresses, or the form enumerates subscribers. */
export async function subscribe(
  rawEmail: unknown,
  config: NewsletterConfig = newsletterConfig(),
): Promise<NewsletterSubscribeResult> {
  if (typeof rawEmail !== "string") return { status: "invalid" }

  const email = normaliseEmail(rawEmail)
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH || !EMAIL_SHAPE.test(email)) {
    // An invalid address is the one distinguishable case: it reveals nothing about subscribers.
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

    // Without the address.
    logger.info({ msg: "newsletter.subscribe", sendDue }, "newsletter subscribe handled")

    return { status: "ok" }
  } catch (err) {
    // The send failed (`throw`): tell the visitor to retry; after the cooldown the token rotates and resends.
    logger.error({ msg: "newsletter.subscribe_failed", err }, "newsletter subscribe failed")
    return { status: "error" }
  }
}

/** Invalid, expired and used tokens all return `expired`. */
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
    // Reports `expired` rather than throwing, and logs loudly.
    logger.error({ msg: "newsletter.confirm_failed", err }, "newsletter confirm failed")
    return { status: "expired" }
  }
}

/** "24 hours" / "2 days", pre-formatted for the email. */
export function expiresInWords(hours: number): string {
  if (hours % 24 === 0 && hours >= 24) {
    const days = hours / 24
    return days === 1 ? "24 hours" : `${days} days`
  }
  return hours === 1 ? "1 hour" : `${hours} hours`
}
