// GET /admin/v1/feedback — list/search/filter feedback (046 US2). Any active staff, incl. csa.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import { json, preamble } from "@effy/edge-shared"

import { guard, mapFeedbackError } from "../feedback/handler-support"
import { list, parseListParams } from "../feedback/service"

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context)
  const g = await guard(event, scope, "read")
  if ("deny" in g) return g.deny

  try {
    const params = parseListParams(event.queryStringParameters ?? {})
    return json(200, await list(params), scope)
  } catch (err) {
    return mapFeedbackError(err, scope)
  }
}
