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
 * POST /customer/v1/password/reset-confirm — complete "forgot password" (012 FR-022b).
 *
 * ⚠⚠ THIS ROUTE IS PUBLIC — NO AUTHORIZER. That is correct, not an oversight. ⚠⚠
 *
 * The caller has NO SESSION. That is the entire point of account recovery: they have lost their way
 * in, and they prove the INBOX instead. Cognito checks the emailed code. The Cognito API this wraps
 * (`ConfirmForgotPassword`) is itself unauthenticated and needs no IAM, so this route holds no
 * privilege whatsoever — it can do nothing that anyone with the code could not already do directly.
 *
 * ── Why it exists at all (it did not, before 012) ──────────────────────────────────────────────
 *
 * Recovery used to run entirely client-side, through Amplify. That caused TWO defects at once, and
 * they are why this file was written (research R6):
 *
 *   1. IT BYPASSED THE BREACH SCREENING. A password rule enforced on the account page but not on the
 *      recovery page is not a rule — it is a detour sign. Recovery sets a password too.
 *
 *   2. IT CORRUPTED `has_password`. The platform never learned that a password now existed, so the
 *      account page went on offering "Set a password" to someone who had one — permanently.
 *
 * ── The disclosure rule ────────────────────────────────────────────────────────────────────────
 *
 * ⚠ IT MUST NOT REVEAL WHETHER AN EMAIL IS REGISTERED. The pool runs
 * `prevent_user_existence_errors = ENABLED` precisely so an attacker cannot enumerate customers. A
 * route that answers differently for a known and an unknown address quietly undoes that — so every
 * Cognito failure below collapses to the SAME response.
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
    // ⚠ Never log the email alongside a recovery outcome — that is the enumeration signal we are
    // trying not to emit, written into our own logs.
    scope.log.info("recovery: password reset completed")
    return json(200, { ok: true }, scope)
  } catch (err) {
    // The password rules DO get a specific answer: the caller already holds a valid code, so telling
    // them "too short" or "breached" discloses nothing about who exists — and without it they cannot
    // possibly succeed.
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

    // ⚠ EVERYTHING ELSE COLLAPSES TO ONE ANSWER — deliberately.
    //
    // `CodeMismatchException` (wrong code), `ExpiredCodeException` (stale code), and
    // `UserNotFoundException` (no such customer) are all answered IDENTICALLY. Distinguishing the
    // last one would turn this endpoint into a customer-enumeration oracle: an attacker submits a
    // junk code for an address and learns from the error whether that person shops at Effy.
    //
    // Yes, this makes the honest customer's "wrong code" message slightly vaguer. That is the trade,
    // and it is the same one `prevent_user_existence_errors` already makes at the pool.
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
