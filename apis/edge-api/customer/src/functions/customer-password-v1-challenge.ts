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

/** Sends the step-up code and returns a masked destination; it grants nothing until the code comes back with the new password. */
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
      // Includes a victim's ID token paired with an attacker's access token.
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
    // The account already has a password; set does not apply.
    return problem(
      409,
      ProblemType.ValidationFailed,
      "Not applicable",
      "this account already has a password",
      scope,
    )
  }
  if (err instanceof CustomerBarredError || err instanceof CustomerNotFoundError) {
    scope.log.warn({ sub }, "password challenge: refused - barred or unknown customer")
    return problem(403, ProblemType.Forbidden, "Not permitted", "this account cannot be used", scope)
  }

  const name = (err as { name?: string })?.name
  if (name === "LimitExceededException" || name === "TooManyRequestsException") {
    // Cognito's own rate limit, surfaced.
    return problem(
      429,
      ProblemType.RateLimited,
      "Too many attempts",
      "wait a few minutes and try again",
      scope,
    )
  }

  // `err` never contains the code or the token.
  scope.log.error({ err, sub }, "password challenge failed")
  return unavailable(scope)
}
