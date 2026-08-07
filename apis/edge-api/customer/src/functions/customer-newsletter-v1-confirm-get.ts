import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import { json, preamble } from "@effy/edge-shared"

import { confirm } from "../newsletter/service"

/**
 * GET /customer/v1/newsletter/confirm?token=… — the double opt-in step (039 US6). Public.
 *
 * ⚠ IT RETURNS JSON, NOT A REDIRECT OR HTML. The subscriber never reaches this endpoint directly: the
 * emailed link points at the web app's `/newsletter/confirm` page, which calls this server-side and
 * renders the outcome. Keeping the API free of presentation means the confirm page can say whatever it
 * needs to and this route stays a single fact.
 *
 * ⚠ GET, WITH A SIDE EFFECT, AND THAT IS DELIBERATE. Confirming is not idempotent in the strict sense —
 * it consumes the token. But the link has to work from an email client, and email clients issue GETs;
 * a POST-only confirm would need JavaScript in the page, which the zero-JS budget rules out. The token
 * is single-use and TTL-bounded, so a prefetching client can at worst confirm a subscription its own
 * user asked for.
 *
 * ⚠ ALWAYS 200. `expired` is an OUTCOME, not an error: the caller is our own confirm page, and a 4xx
 * would make it handle a network failure and a dead token through the same branch when they need
 * different words.
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
