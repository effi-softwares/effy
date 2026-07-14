import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import { json, preamble, problem, ProblemType, unavailable } from "@effy/edge-shared"

import { requireCaller, TokenMismatchError } from "../password/identity"
import {
  CustomerBarredError,
  CustomerNotFoundError,
  sendPasswordChallenge,
  WrongModeError,
} from "../password/service"

/**
 * POST /customer/v1/password/challenge — send the step-up code (012 FR-017).
 *
 * ⚠ THIS ENDPOINT GRANTS NOTHING. It puts a code in the customer's inbox and returns a MASKED
 * destination. It mints no token, stores no grant, and creates no state — so there is nothing here
 * to steal. The code only becomes worth anything when presented back, with a new password, to
 * `PUT /customer/v1/password` in a single request.
 *
 * That is deliberate. The obvious alternative — verify a code here, hand back a "you may now set a
 * password" grant — would be creating a fresh credential for an attacker to lift.
 */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context)

  let caller
  try {
    caller = requireCaller(event)
  } catch (err) {
    if (err instanceof TokenMismatchError) {
      // Includes the mismatched-pair attack: a victim's ID token + the attacker's access token.
      scope.log.warn({ reason: err.message }, "password challenge: refused at the identity guard")
      return problem(
        401,
        ProblemType.Unauthenticated,
        "Authentication required",
        "a valid customer session is required",
        scope,
      )
    }
    throw err
  }

  try {
    const result = await sendPasswordChallenge(caller.sub, caller.accessToken)
    scope.log.info({ sub: caller.sub }, "password challenge sent")
    return json(202, result, scope)
  } catch (err) {
    return mapError(err, caller.sub, scope)
  }
}

function mapError(
  err: unknown,
  sub: string,
  scope: ReturnType<typeof preamble>,
): APIGatewayProxyStructuredResultV2 {
  if (err instanceof WrongModeError) {
    // FR-014 — the account already has a password; the SET flow does not apply to it.
    return problem(
      409,
      ProblemType.ValidationFailed,
      "Not applicable",
      "this account already has a password",
      scope,
    )
  }
  if (err instanceof CustomerBarredError || err instanceof CustomerNotFoundError) {
    scope.log.warn({ sub }, "password challenge: refused — barred or unknown customer")
    return problem(403, ProblemType.Forbidden, "Not permitted", "this account cannot be used", scope)
  }

  const name = (err as { name?: string })?.name
  if (name === "LimitExceededException" || name === "TooManyRequestsException") {
    // FR-020 — Cognito's own rate limit, surfaced rather than swallowed.
    return problem(
      429,
      ProblemType.RateLimited,
      "Too many attempts",
      "wait a few minutes and try again",
      scope,
    )
  }

  // ⚠ `err` never contains the code or the token — Cognito does not echo them. Keep it that way.
  scope.log.error({ err, sub }, "password challenge failed")
  return unavailable(scope)
}
