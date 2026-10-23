// Matched case-insensitively (citext); the repair therefore uses the stored raw_address.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import { json, preamble } from "@effy/edge-shared"

import { guard, mapDeliverabilityError } from "../deliverability/handler-support"
import { detail } from "../deliverability/service"

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context)
  const g = await guard(event, scope, "read")
  if ("deny" in g) return g.deny

  const address = decodeURIComponent(event.pathParameters?.address ?? "")

  try {
    return json(200, await detail(address), scope)
  } catch (err) {
    return mapDeliverabilityError(err, scope)
  }
}
