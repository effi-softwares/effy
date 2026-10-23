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
import { updateName } from "../password/cognito"
import { ACCESS_TOKEN_HEADER } from "../password/identity"

const MAX_NAME = 60

/** Bounded but not format-checked: the phone is unverified and never used for identity. */
const MAX_PHONE = 32

/**
 * Only the name parts and phone are writable. Not `email` (an identity operation, verified in Cognito),
 * not `status` (platform-owned), not ids. Other fields are ignored: the UPDATE names its columns.
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
    await syncNameToCognito(event, scope, sub, given.value, family.value)
    return json(200, customer, scope)
  } catch (err) {
    if (err instanceof CustomerBarredError || err instanceof CustomerClosingError) {
      // One uniform refusal for barred and closing.
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
      // A valid token but no record: they never completed a GET /me.
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
 * Mirrors the name onto Cognito so the ID token's claim (the storefront greets from it) matches the
 * record. Database first and never fatal. The access token is optional here; without it the mirror is
 * skipped and logged. The phone is never sent. No IAM: the customer's own access token authorises it.
 */
async function syncNameToCognito(
  event: AuthedEvent,
  scope: ReturnType<typeof preamble>,
  sub: string,
  givenName: string | null,
  familyName: string | null,
): Promise<void> {
  const headers = event.headers ?? {}
  const accessToken =
    headers[ACCESS_TOKEN_HEADER] ?? headers[ACCESS_TOKEN_HEADER.toUpperCase()] ?? undefined

  if (!accessToken) {
    scope.log.warn({ sub }, "profile name not mirrored to cognito: no access token presented")
    return
  }

  try {
    await updateName(accessToken, givenName, familyName)
  } catch (err) {
    scope.log.warn({ err, sub }, "profile name mirror to cognito failed")
  }
}

/** `null` or `""` clears; a string is trimmed. Mobile drops nulls, so clearing travels as `""`. */
function normalise(raw: unknown, max: number): { value: string | null; error?: true } {
  if (raw === null || raw === undefined) return { value: null }
  if (typeof raw !== "string") return { value: null, error: true }

  const trimmed = raw.trim()
  if (trimmed.length > max) return { value: null, error: true }
  return { value: trimmed === "" ? null : trimmed }
}
