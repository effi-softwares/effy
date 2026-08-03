import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import {
  json,
  parseJsonBody,
  preamble,
  problem,
  ProblemType,
  subject,
  unavailable,
} from "@effy/edge-shared"

import {
  CustomerBarredError,
  CustomerClosingError,
  CustomerNotFoundError,
  updateCustomerProfile,
} from "../customer/service"

const MAX_NAME = 60

/**
 * The phone is bounded but NOT format-checked (034 FR-060).
 *
 * ⚠ Deliberately loose. The value is unverified and non-authoritative — FR-060a bars it from every
 * identity, recovery and authentication path — so a strict national pattern would be a support
 * burden that buys nothing. The bound exists only to stop an unbounded write.
 */
const MAX_PHONE = 32

/**
 * PATCH /customer/v1/me — the customer maintains their own details (FR-026).
 *
 * ⚠ `givenName` and `familyName` ARE THE ONLY WRITABLE FIELDS, and the omissions are deliberate:
 *
 *   • `email`  — changing it is an IDENTITY operation, not a profile edit. A customer who can
 *                rewrite their own email can point it at a victim's address; that is the well-known
 *                Cognito takeover. It is locked in Cognito by requiring verification of the NEW
 *                address before the sign-in identity moves, and it is simply not accepted here.
 *   • `status` — platform-owned (FR-025). Accepting it would let a barred customer un-ban themselves
 *                in a single request.
 *   • `id` / `cognito_sub` — identity keys. Not data.
 *
 * Anything not listed above is IGNORED rather than rejected: the UPDATE names its columns
 * explicitly, so an unexpected field in the body can never reach the database.
 */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context)

  const sub = subject(event)
  if (!sub) {
    return problem(
      401,
      ProblemType.Unauthenticated,
      "Authentication required",
      "a valid token for the customer audience is required",
      scope,
    )
  }

  const body = parseJsonBody<{ givenName?: unknown; familyName?: unknown; phone?: unknown }>(
    event.body,
  )
  if (body.errors.length > 0 || !body.value) {
    return problem(
      400,
      ProblemType.ValidationFailed,
      "Invalid request",
      body.errors[0]?.message ?? "the request body is not valid JSON",
      scope,
    )
  }

  const given = normalise(body.value.givenName, MAX_NAME)
  const family = normalise(body.value.familyName, MAX_NAME)
  const phone = normalise(body.value.phone, MAX_PHONE)

  if (given.error || family.error) {
    return problem(
      400,
      ProblemType.ValidationFailed,
      "Invalid request",
      `givenName and familyName must be strings of ${MAX_NAME} characters or fewer, or null to clear`,
      scope,
    )
  }

  if (phone.error) {
    return problem(
      400,
      ProblemType.ValidationFailed,
      "Invalid request",
      `phone must be a string of ${MAX_PHONE} characters or fewer, or empty to clear`,
      scope,
    )
  }

  try {
    const customer = await updateCustomerProfile(sub, {
      givenName: given.value,
      familyName: family.value,
      phone: phone.value,
    })
    return json(200, customer, scope)
  } catch (err) {
    if (err instanceof CustomerBarredError || err instanceof CustomerClosingError) {
      // ⚠ ONE uniform refusal for both. A barred customer and a closing one are different facts, and
      // the service keeps them as distinct errors for the logs — but the WIRE must not disclose
      // which applied, matching the posture every other customer route already holds.
      scope.log.warn(
        { sub, reason: err instanceof CustomerClosingError ? "closing" : "barred" },
        "profile update refused",
      )
      return problem(
        403,
        ProblemType.Forbidden,
        "Not permitted",
        "this account cannot be used",
        scope,
      )
    }
    if (err instanceof CustomerNotFoundError) {
      // A valid token, but no record — they have never completed a GET /me.
      return problem(
        403,
        ProblemType.Forbidden,
        "Not permitted",
        "this account cannot be used",
        scope,
      )
    }
    scope.log.error({ err, sub }, "profile update failed")
    return unavailable(scope)
  }
}

/**
 * `null` clears the field; a string is trimmed; an empty string means "cleared".
 *
 * ⚠ THE `""`-MEANS-CLEAR RULE IS LOAD-BEARING, NOT COSMETIC. The mobile client serialises with
 * `explicitNulls = false`, so a `null` is dropped from the payload entirely and arrives here as
 * `undefined` — indistinguishable from "field not sent". Every clearable field must therefore send
 * `""`, and every clearable field must be normalised through this one function, or clearing it
 * silently no-ops on mobile while appearing to work on web.
 */
function normalise(raw: unknown, max: number): { value: string | null; error?: true } {
  if (raw === null || raw === undefined) return { value: null }
  if (typeof raw !== "string") return { value: null, error: true }

  const trimmed = raw.trim()
  if (trimmed.length > max) return { value: null, error: true }
  return { value: trimmed === "" ? null : trimmed }
}
