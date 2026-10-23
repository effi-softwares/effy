import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import { json, preamble, problem, ProblemType, unavailable } from "@effy/edge-shared"

import {
  ClosureAlreadyRequestedError,
  ClosureBlockedError,
  CustomerRecordMissingError,
  sendClosureChallenge,
} from "../closure/service"
import { requireCaller, TokenMismatchError } from "../password/identity"

/**
 * Sends the step-up code and returns a masked destination; grants nothing until the code comes back
 * with the confirmation. Uses the email attribute, so a Google-only customer can complete it.
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
      scope.log.warn({ reason: err.message }, "closure challenge: refused at the identity guard")
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
    const result = await sendClosureChallenge(caller.sub, caller.accessToken)
    scope.log.info({ sub: caller.sub }, "closure challenge sent")
    return json(202, result, scope)
  } catch (err) {
    if (err instanceof ClosureBlockedError) {
      // With the blockers, which the client re-renders.
      return json(409, { blockers: err.blockers }, scope)
    }
    if (err instanceof ClosureAlreadyRequestedError) {
      return problem(
        409,
        ProblemType.ValidationFailed,
        "Already requested",
        "this account is already scheduled for deletion",
        scope,
      )
    }
    if (err instanceof CustomerRecordMissingError) {
      return problem(
        403,
        ProblemType.Forbidden,
        "Not permitted",
        "this account cannot be used",
        scope,
      )
    }

    const name = (err as { name?: string })?.name
    if (name === "LimitExceededException" || name === "TooManyRequestsException") {
      return problem(
        429,
        ProblemType.RateLimited,
        "Too many attempts",
        "wait a few minutes and try again",
        scope,
      )
    }

    // `err` never contains the code or the token.
    scope.log.error({ err, sub: caller.sub }, "closure challenge failed")
    return unavailable(scope)
  }
}
