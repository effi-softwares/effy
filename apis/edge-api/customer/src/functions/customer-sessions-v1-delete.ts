import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import { preamble, problem, ProblemType, unavailable } from "@effy/edge-shared"

import { globalSignOut } from "../password/cognito"
import { requireCaller, TokenMismatchError } from "../password/identity"

/**
 * "Sign out on all devices", including this one (Cognito revocation is all-or-nothing). Not instant:
 * issued tokens work until they expire (up to 60 minutes), and the UI says so. Not gated on status:
 * anyone may sign out.
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
      scope.log.warn({ reason: err.message }, "sign-out-all: refused at the identity guard")
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
    await globalSignOut(caller.accessToken)
    scope.log.info({ sub: caller.sub }, "sign-out-all: every session revoked")
    return { statusCode: 204, headers: { "x-request-id": scope.requestId } }
  } catch (err) {
    const name = (err as { name?: string })?.name
    if (name === "NotAuthorizedException") {
      // Already dead: the outcome the caller wanted.
      scope.log.info({ sub: caller.sub }, "sign-out-all: session was already revoked")
      return { statusCode: 204, headers: { "x-request-id": scope.requestId } }
    }
    scope.log.error({ err, sub: caller.sub }, "sign-out-all failed")
    return unavailable(scope)
  }
}
