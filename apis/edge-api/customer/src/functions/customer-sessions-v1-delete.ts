import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import { preamble, problem, ProblemType, unavailable } from "@effy/edge-shared"

import { globalSignOut } from "../password/cognito"
import { requireCaller, TokenMismatchError } from "../password/identity"

/**
 * DELETE /customer/v1/sessions — "sign out on all devices" (012 FR-032).
 *
 * The customer's only self-service remedy for "I signed in on a hotel PC" or "I lost my phone".
 * Token-authorized; needs no IAM.
 *
 * ⚠ IT INCLUDES THE CURRENT DEVICE, and the UI must say so. Cognito's revocation is all-or-nothing:
 * there is no "revoke all except this one", and the other sessions' refresh tokens cannot be
 * enumerated in order to revoke them selectively.
 *
 * ⚠ AND IT IS NOT INSTANT. Revoking refresh tokens does not invalidate already-issued ID/access
 * tokens at our API Gateway JWT authorizer, which checks signature and expiry and knows nothing of
 * revocation. Another device's token keeps working until it EXPIRES — up to 60 minutes on the current
 * pool config. FR-024a requires that be stated, not wished away (research R7).
 *
 * ⚠ NOT gated on `status`. A barred customer may absolutely still sign themselves out — refusing that
 * would be perverse: it is the one thing we should never stop anyone from doing.
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
      // The token is already dead — which is the outcome the caller wanted. Not an error.
      scope.log.info({ sub: caller.sub }, "sign-out-all: session was already revoked")
      return { statusCode: 204, headers: { "x-request-id": scope.requestId } }
    }
    scope.log.error({ err, sub: caller.sub }, "sign-out-all failed")
    return unavailable(scope)
  }
}
