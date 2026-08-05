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
 * POST /customer/v1/closure/challenge — issue the step-up code closure requires (FR-043).
 *
 * ⚠ THIS ENDPOINT GRANTS NOTHING, exactly like its password sibling. It puts a code in the
 * customer's inbox and returns a MASKED destination. It mints no token and stores no grant, so there
 * is nothing here to steal — the code becomes worth something only when presented back, together
 * with the confirmation, to `POST /customer/v1/closure` in a single request.
 *
 * ⚠ It reuses the SAME token-authorized email-attribute primitive as the password flow, which is why
 * it works for a customer whose only credential is Google. A password prompt would be an
 * unresolvable dead end for them.
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
      // 409 with the blockers in the body — the client re-renders them rather than guessing.
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

    // ⚠ `err` never contains the code or the token — Cognito does not echo them. Keep it that way.
    scope.log.error({ err, sub: caller.sub }, "closure challenge failed")
    return unavailable(scope)
  }
}
