import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import { json, preamble, problem, ProblemType, subject } from "@effy/edge-shared"

import { submitFeedback } from "../feedback/service"

/**
 * POST /customer/v1/feedback — submit feedback as a SIGNED-IN customer (046 US1).
 *
 * ⚠ AUTHENTICATED sibling of the public route. The verified `sub` links the submission to the customer
 * record and selects the TRUSTED profile email; a body email is ignored on this path (research D2).
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

  let body: unknown
  try {
    body = JSON.parse(event.body ?? "{}")
  } catch {
    return json(400, { status: "invalid", field: "message" }, scope)
  }

  const result = await submitFeedback(body, { kind: "customer", cognitoSub: sub })

  if (result.status === "invalid") return json(400, result, scope)
  if (result.status === "rate_limited") return json(429, result, scope)
  if (result.status === "error") return json(503, result, scope)
  return json(201, result, scope)
}
