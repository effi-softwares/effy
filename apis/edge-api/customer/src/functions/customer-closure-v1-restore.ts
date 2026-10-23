import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import { json, preamble, problem, ProblemType, subject, unavailable } from "@effy/edge-shared"

import {
  CustomerRecordMissingError,
  NoLiveClosureRequestError,
  restoreClosure,
} from "../closure/service"

/**
 * The only way back from `closing`, and explicit: signing in surfaces the choice, and the client calls
 * this only after a deliberate confirmation.
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

  try {
    const result = await restoreClosure(sub)
    scope.log.info({ sub }, "account closure cancelled — account restored")
    return json(200, result, scope)
  } catch (err) {
    if (err instanceof NoLiveClosureRequestError) {
      // Distinguishable, so the client simply carries on for an account that was never closing.
      return problem(
        409,
        ProblemType.ValidationFailed,
        "Nothing to restore",
        "this account is not scheduled for deletion",
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
    scope.log.error({ err, sub }, "account restore failed")
    return unavailable(scope)
  }
}
