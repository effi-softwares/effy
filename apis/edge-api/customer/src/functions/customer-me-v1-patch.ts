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
  CustomerNotFoundError,
  updateCustomerProfile,
} from "../customer/service"

const MAX_NAME = 60

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

  const body = parseJsonBody<{ givenName?: unknown; familyName?: unknown }>(event.body)
  if (body.errors.length > 0 || !body.value) {
    return problem(
      400,
      ProblemType.ValidationFailed,
      "Invalid request",
      body.errors[0]?.message ?? "the request body is not valid JSON",
      scope,
    )
  }

  const given = normalise(body.value.givenName)
  const family = normalise(body.value.familyName)

  if (given.error || family.error) {
    return problem(
      400,
      ProblemType.ValidationFailed,
      "Invalid request",
      `givenName and familyName must be strings of ${MAX_NAME} characters or fewer, or null to clear`,
      scope,
    )
  }

  try {
    const customer = await updateCustomerProfile(sub, {
      givenName: given.value,
      familyName: family.value,
    })
    return json(200, customer, scope)
  } catch (err) {
    if (err instanceof CustomerBarredError) {
      scope.log.warn({ sub }, "profile update refused — barred customer")
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

/** `null` clears the field; a string is trimmed; an empty string means "cleared". */
function normalise(raw: unknown): { value: string | null; error?: true } {
  if (raw === null || raw === undefined) return { value: null }
  if (typeof raw !== "string") return { value: null, error: true }

  const trimmed = raw.trim()
  if (trimmed.length > MAX_NAME) return { value: null, error: true }
  return { value: trimmed === "" ? null : trimmed }
}
