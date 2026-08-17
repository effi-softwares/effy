import { logger } from "@effy/edge-shared"
import { sendEmail } from "@effy/email-kit/send"
import {
  EMAIL_MAX_LENGTH,
  EMAIL_SHAPE,
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_MESSAGE_MAX,
  type FeedbackCategory,
  type FeedbackPlatform,
  type FeedbackSource,
  type SubmitFeedbackResult,
} from "@effy/shared-types"

import {
  findCustomerBySub,
  insertSubmission,
  type InsertSubmissionInput,
} from "./repo"
import { generateReferenceCode, ipSource, sourceKey, subSource } from "./lib"

/**
 * Feedback submission (046 US1). Cold path, one service behind two handlers (authed + guest).
 *
 * ⚠ THE VALIDATION IS THE SAME FOR BOTH CALLERS; only identity differs. A signed-in submitter is
 * linked to their customer record and gets their TRUSTED profile email (a body email is ignored on
 * that path); a guest supplies an UNVERIFIED email used only to send the acknowledgement. The email
 * shape/length rule is the shared one (044) so the form refuses exactly what this refuses.
 */

const DEFAULT_WINDOW_MINUTES = 60
const DEFAULT_MAX_PER_WINDOW = 5
const MAX_RATING = 5

export interface FeedbackConfig {
  windowMinutes: number
  maxPerWindow: number
  sourceSalt: string
}

export function feedbackConfig(env: NodeJS.ProcessEnv = process.env): FeedbackConfig {
  return {
    windowMinutes: Number(env.FEEDBACK_RATE_WINDOW_MINUTES ?? DEFAULT_WINDOW_MINUTES),
    maxPerWindow: Number(env.FEEDBACK_RATE_MAX ?? DEFAULT_MAX_PER_WINDOW),
    sourceSalt: env.FEEDBACK_SOURCE_SALT ?? "",
  }
}

/** Who is submitting. The handler resolves this from the route; the service never trusts a body id. */
export type SubmitContext =
  | { kind: "customer"; cognitoSub: string }
  | { kind: "guest"; sourceIp: string }

interface ParsedInput {
  category: FeedbackCategory
  message: string
  rating: number | null
  source: FeedbackSource
  platform: FeedbackPlatform
  bodyEmail: string | null
  bodyName: string | null
}

const SOURCES: readonly FeedbackSource[] = ["checkout", "general", "other"]
const PLATFORMS: readonly FeedbackPlatform[] = ["web", "ios", "android"]

/** Validate the request body. Returns the parsed input or the first field that failed. */
function parse(raw: unknown):
  | { ok: true; value: ParsedInput }
  | { ok: false; field: NonNullable<Extract<SubmitFeedbackResult, { status: "invalid" }>["field"]> } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, field: "message" }
  }
  const bag = raw as Record<string, unknown>

  if (typeof bag.category !== "string" || !FEEDBACK_CATEGORIES.includes(bag.category as FeedbackCategory)) {
    return { ok: false, field: "category" }
  }
  if (typeof bag.message !== "string" || bag.message.trim().length === 0) {
    return { ok: false, field: "message" }
  }
  // ⚠ Bound BEFORE storage (FR-007); the DB CHECK is the backstop, not the first line of defence.
  if (bag.message.trim().length > FEEDBACK_MESSAGE_MAX) {
    return { ok: false, field: "message" }
  }

  let rating: number | null = null
  if (bag.rating !== undefined && bag.rating !== null) {
    if (typeof bag.rating !== "number" || !Number.isInteger(bag.rating) || bag.rating < 1 || bag.rating > MAX_RATING) {
      return { ok: false, field: "rating" }
    }
    rating = bag.rating
  }

  if (typeof bag.source !== "string" || !SOURCES.includes(bag.source as FeedbackSource)) {
    return { ok: false, field: "source" }
  }
  if (typeof bag.platform !== "string" || !PLATFORMS.includes(bag.platform as FeedbackPlatform)) {
    return { ok: false, field: "platform" }
  }

  let bodyEmail: string | null = null
  if (bag.email !== undefined && bag.email !== null && bag.email !== "") {
    if (typeof bag.email !== "string") return { ok: false, field: "email" }
    const email = bag.email.trim().toLowerCase()
    if (email.length > EMAIL_MAX_LENGTH || !EMAIL_SHAPE.test(email)) {
      return { ok: false, field: "email" }
    }
    bodyEmail = email
  }

  const bodyName =
    typeof bag.name === "string" && bag.name.trim().length > 0 ? bag.name.trim().slice(0, 120) : null

  return {
    ok: true,
    value: {
      category: bag.category as FeedbackCategory,
      message: bag.message.trim(),
      rating,
      source: bag.source as FeedbackSource,
      platform: bag.platform as FeedbackPlatform,
      bodyEmail,
      bodyName,
    },
  }
}

export async function submitFeedback(
  raw: unknown,
  ctx: SubmitContext,
  config: FeedbackConfig = feedbackConfig(),
): Promise<SubmitFeedbackResult> {
  const parsed = parse(raw)
  if (!parsed.ok) return { status: "invalid", field: parsed.field }
  const input = parsed.value

  // Identity — resolved from the ROUTE, never from the body (research D2).
  let customerId: string | null = null
  let submitterEmail: string | null = null
  let emailVerified = false
  let submitterName: string | null = input.bodyName
  let rawSource: string

  if (ctx.kind === "customer") {
    rawSource = subSource(ctx.cognitoSub)
    const customer = await findCustomerBySub(ctx.cognitoSub)
    if (customer) {
      customerId = customer.id
      submitterEmail = customer.email // ⚠ TRUSTED — the verified profile email, not a body value.
      emailVerified = true
      const profileName = [customer.givenName, customer.familyName].filter(Boolean).join(" ").trim()
      submitterName = input.bodyName ?? (profileName.length > 0 ? profileName : null)
    }
    // If no customer record yet (record is created lazily on /me), we still store the feedback but
    // cannot link it or trust an email — the sub still bounds the rate limit.
  } else {
    rawSource = ipSource(ctx.sourceIp)
    submitterEmail = input.bodyEmail // ⚠ UNVERIFIED — used only to send the acknowledgement/reply.
  }

  const key = sourceKey(rawSource, config.sourceSalt)

  const baseInsert: Omit<InsertSubmissionInput, "referenceCode"> = {
    category: input.category,
    message: input.message,
    rating: input.rating,
    submitterName,
    submitterEmail,
    emailVerified,
    customerId,
    source: input.source,
    platform: input.platform,
    sourceKey: key,
    windowMinutes: config.windowMinutes,
    maxPerWindow: config.maxPerWindow,
  }

  let referenceCode: string
  try {
    // ⚠ Retry ONLY on a reference-code collision (unique violation). Everything else propagates.
    let inserted: Awaited<ReturnType<typeof insertSubmission>> | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = generateReferenceCode()
      try {
        inserted = await insertSubmission({ ...baseInsert, referenceCode: code })
        break
      } catch (err) {
        if (isUniqueViolation(err) && attempt < 2) continue
        throw err
      }
    }
    if (!inserted) return { status: "error" }
    if (inserted.status === "rate_limited") {
      // ⚠ Logged WITHOUT the address (Principle VII). The outcome is the operational fact.
      logger.info({ msg: "feedback.rate_limited", kind: ctx.kind }, "feedback submission refused by rate limit")
      return { status: "rate_limited" }
    }
    referenceCode = inserted.referenceCode
  } catch (err) {
    logger.error({ msg: "feedback.submit_failed", err }, "feedback submission failed to store")
    return { status: "error" }
  }

  // ⚠ The submission is now STORED. A failed acknowledgement must NOT lose it (FR-015) — and
  // `feedback-received` declares `onSendFailure: "swallow"`, so this send will not throw. We still
  // guard and log, because a swallowed failure is exactly the kind that must remain visible.
  if (submitterEmail) {
    try {
      await sendEmail(
        "feedback-received",
        { referenceCode, category: FEEDBACK_CATEGORY_LABELS[input.category] },
        { to: submitterEmail, audience: "customer" },
        logger,
      )
    } catch (err) {
      logger.error({ msg: "feedback.ack_failed", referenceCode }, "feedback thank-you email failed to send")
    }
  }

  logger.info(
    { msg: "feedback.submitted", kind: ctx.kind, category: input.category, hasEmail: Boolean(submitterEmail) },
    "feedback submission stored",
  )
  return { status: "ok", referenceCode }
}

/** Postgres unique-violation SQLSTATE. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505"
}
