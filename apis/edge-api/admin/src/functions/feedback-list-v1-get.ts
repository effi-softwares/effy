import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import { json, listProblem, parseListQuery, preamble } from "@effy/edge-shared"

import { guard, mapFeedbackError } from "../feedback/handler-support"
import { FEEDBACK_LIST_SPEC } from "../feedback/list"
import { list, viewCounts } from "../feedback/service"

/** Customer feedback, a console list (103); `?views=only` answers every view's count in one request. */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context)
  const g = await guard(event, scope, "read")
  if ("deny" in g) return g.deny

  try {
    const req = parseListQuery(event.queryStringParameters, FEEDBACK_LIST_SPEC)
    if (req.viewsOnly) return json(200, { views: await viewCounts(req) }, scope)
    return json(200, await list(req), scope)
  } catch (err) {
    return listProblem(err, scope) ?? mapFeedbackError(err, scope)
  }
}
