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

const MAX_NAME = 120

/**
 * PATCH /customer/v1/me — the customer maintains their own details (FR-026).
 *
 * ⚠ `displayName` IS THE ONLY WRITABLE FIELD, and the omissions are deliberate:
 *
 *   • `email`  — changing it is an IDENTITY operation, not a profile edit. A customer who can
 *                rewrite their own email can point it at a victim's address; that is the
 *                well-known Cognito takeover, and it is why the app client also forbids writing
 *                the attribute. Email changes, if they are ever offered, need re-verification and
 *                a slice of their own.
 *   • `status` — platform-owned (FR-025). Letting a customer PATCH their own status would let a
 *                barred customer un-ban themselves in one request.
 *   • `id` / `cognito_sub` — identity keys. Not data.
 *
 * Anything not listed above is IGNORED, not rejected: the update statement names its columns
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

  const body = parseJsonBody<{ displayName?: unknown }>(event.body)
  if (body.errors.length > 0 || !body.value) {
    return problem(
      400,
      ProblemType.ValidationFailed,
      "Invalid request",
      body.errors[0]?.message ?? "the request body is not valid JSON",
      scope,
    )
  }

  const raw = body.value.displayName
  if (raw !== null && typeof raw !== "string") {
    return problem(
      400,
      ProblemType.ValidationFailed,
      "Invalid request",
      "displayName must be a string, or null to clear it",
      scope,
    )
  }

  const displayName = raw === null ? null : raw.trim()
  if (displayName !== null && displayName.length > MAX_NAME) {
    return problem(
      400,
      ProblemType.ValidationFailed,
      "Invalid request",
      `displayName must be ${MAX_NAME} characters or fewer`,
      scope,
    )
  }

  try {
    const customer = await updateCustomerProfile(sub, {
      displayName: displayName === "" ? null : displayName,
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
      // They hold a valid token but have no record — they have never completed a GET /me.
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
