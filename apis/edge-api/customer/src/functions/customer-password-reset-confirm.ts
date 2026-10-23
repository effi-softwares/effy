import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from "aws-lambda"

import {
  json,
  parseJsonBody,
  preamble,
  problem,
  ProblemType,
  unavailable,
} from "@effy/edge-shared"

import { confirmRecovery, PasswordPolicyError } from "../password/service"

/**
 * Completes "forgot password". Public: the caller has no session and proves the inbox instead
 * (`ConfirmForgotPassword` needs no IAM). Server-side so recovery gets breach screening and updates
 * `has_password`. It must not reveal whether an email is registered: every Cognito failure collapses
 * to one answer.
 */
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context)

  const clientId = process.env.CUSTOMER_APP_CLIENT_ID
  if (!clientId) {
    scope.log.error("CUSTOMER_APP_CLIENT_ID is unset — recovery cannot run")
    return unavailable(scope)
  }

  const parsed = parseJsonBody<Record<string, unknown>>(event.body)
  if (parsed.errors.length > 0 || !parsed.value) {
    return badRequest(scope, "the request body is not valid JSON")
  }

  const { email, code, newPassword } = parsed.value
  if (
    typeof email !== "string" ||
    typeof code !== "string" ||
    typeof newPassword !== "string" ||
    !email ||
    !code ||
    !newPassword
  ) {
    return badRequest(scope, "email, code and newPassword are required")
  }

  try {
    await confirmRecovery({ clientId, email, code, newPassword })
    // Never log the email with a recovery outcome.
    scope.log.info("recovery: password reset completed")
    return json(200, { ok: true }, scope)
  } catch (err) {
    // Password rules get a specific answer: the caller holds a valid code, so nothing is disclosed.
    if (err instanceof PasswordPolicyError) {
      return badRequest(scope, err.message)
    }

    const name = (err as { name?: string })?.name

    if (
      name === "LimitExceededException" ||
      name === "TooManyRequestsException" ||
      name === "TooManyFailedAttemptsException"
    ) {
      return problem(
        429,
        ProblemType.RateLimited,
        "Too many attempts",
        "wait a few minutes and try again",
        scope,
      )
    }

    // Wrong code, stale code and no such customer answer identically, or this enumerates customers.
    scope.log.warn({ errName: name }, "recovery: refused")
    return badRequest(scope, "That code isn't right or has expired. Ask for a new one.")
  }
}

function badRequest(
  scope: ReturnType<typeof preamble>,
  detail: string,
): APIGatewayProxyStructuredResultV2 {
  return problem(400, ProblemType.ValidationFailed, "Invalid request", detail, scope)
}
