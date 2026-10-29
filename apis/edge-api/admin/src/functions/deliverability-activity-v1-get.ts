// One address's email events in the activity drawer (104). Matched case-insensitively (citext).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import { activityResponse, preamble } from "@effy/edge-shared"

import { emailActivitySource } from "../deliverability/activity"
import { guard, mapDeliverabilityError } from "../deliverability/handler-support"

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context)
  const g = await guard(event, scope, "read")
  if ("deny" in g) return g.deny

  const address = decodeURIComponent(event.pathParameters?.address ?? "")

  try {
    return await activityResponse(event.queryStringParameters, scope, "bo-email", async () => emailActivitySource(address))
  } catch (err) {
    return mapDeliverabilityError(err, scope)
  }
}
