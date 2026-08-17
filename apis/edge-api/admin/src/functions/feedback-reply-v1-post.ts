// POST /admin/v1/feedback/{referenceCode}/reply — reply to the submitter by email (046 US3).
// ⚠ admin/manager ONLY — an outward, brand-facing message to a real person (research D7). 403 for csa.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared"

import { guard, mapFeedbackError } from "../feedback/handler-support"
import { detail, reply } from "../feedback/service"

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context)
  const g = await guard(event, scope, "reply")
  if ("deny" in g) return g.deny

  const referenceCode = event.pathParameters?.referenceCode
  if (!referenceCode) {
    return problem(400, ProblemType.ValidationFailed, "Invalid request", "a reference code is required", scope)
  }

  const body = parseJsonBody<{ body?: unknown }>(event.body)
  if (body.errors.length > 0 || !body.value) {
    return problem(400, ProblemType.ValidationFailed, "Invalid request", "a JSON body is required", scope)
  }

  try {
    await reply(referenceCode, body.value.body, g.actor)
    return json(200, await detail(referenceCode), scope)
  } catch (err) {
    return mapFeedbackError(err, scope)
  }
}
