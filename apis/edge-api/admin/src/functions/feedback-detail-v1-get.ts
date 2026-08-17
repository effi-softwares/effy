// GET /admin/v1/feedback/{referenceCode} — full submission + replies + notes (046 US2). Any active staff.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import { json, preamble, problem, ProblemType } from "@effy/edge-shared"

import { guard, mapFeedbackError } from "../feedback/handler-support"
import { detail } from "../feedback/service"

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context)
  const g = await guard(event, scope, "read")
  if ("deny" in g) return g.deny

  const referenceCode = event.pathParameters?.referenceCode
  if (!referenceCode) {
    return problem(400, ProblemType.ValidationFailed, "Invalid request", "a reference code is required", scope)
  }

  try {
    return json(200, await detail(referenceCode), scope)
  } catch (err) {
    return mapFeedbackError(err, scope)
  }
}
