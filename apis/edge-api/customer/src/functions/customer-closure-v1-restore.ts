import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import { json, preamble, problem, ProblemType, subject, unavailable } from "@effy/edge-shared"

import {
  CustomerRecordMissingError,
  NoLiveClosureRequestError,
  restoreClosure,
} from "../closure/service"

/**
 * POST /customer/v1/closure/restore — cancel a live closure request (FR-041a).
 *
 * ⚠⚠ THIS IS AN EXPLICIT CALL, AND THAT IS THE WHOLE POINT. ⚠⚠
 *
 * An earlier design had signing in restore the account implicitly. It is unimplementable that way —
 * the refusal and the restore run through the SAME identity lookup, so the gate would refuse the
 * very request meant to restore — and it is unsafe: anyone holding the customer's token during the
 * grace window would silently un-delete the account merely by opening the app.
 *
 * The client SURFACES the choice on sign-in and calls this only after a deliberate confirmation.
 *
 * ⚠ This route is deliberately reachable while `closure_state = 'closing'` — it is the ONE exception
 * FR-041 carves out, and the only way back.
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
      // Not an error the customer caused, and distinguishable so the client can simply carry on
      // rather than showing a failure for an account that was never closing.
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
