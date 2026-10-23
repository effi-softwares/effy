import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import { json, preamble, problem, ProblemType, subject, unavailable } from "@effy/edge-shared"

import { CustomerRecordMissingError, previewClosure } from "../closure/service"

/**
 * Everything to see before any irreversible step; side-effect free. Reachable by a barred customer:
 * the service reads the record directly, not through `assertActive`.
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
    const preview = await previewClosure(sub)
    return json(200, preview, scope)
  } catch (err) {
    if (err instanceof CustomerRecordMissingError) {
      return problem(
        403,
        ProblemType.Forbidden,
        "Not permitted",
        "this account cannot be used",
        scope,
      )
    }
    scope.log.error({ err, sub }, "closure preview failed")
    return unavailable(scope)
  }
}
