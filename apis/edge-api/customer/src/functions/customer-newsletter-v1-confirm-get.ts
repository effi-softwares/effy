import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import { json, preamble } from "@effy/edge-shared"

import { confirm } from "../newsletter/service"

/**
 * Public. Returns JSON for the web confirm page, which calls it server-side. A GET with a side effect
 * because email clients issue GETs; the token is single-use and TTL-bounded. Always 200: `expired` is
 * an outcome, not an error.
 */
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context)

  const result = await confirm(event.queryStringParameters?.token)

  scope.log.info({ msg: "newsletter.confirm", status: result.status }, "newsletter confirm handled")

  return json(200, result, scope)
}
