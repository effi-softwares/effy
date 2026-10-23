import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import { json, preamble } from "@effy/edge-shared"

import { subscribe } from "../newsletter/service"

/** Public: anonymous visitors subscribe. 202, not 201: nobody is subscribed until they follow the emailed link. */
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context)

  let email: unknown
  try {
    // A malformed body is `invalid`, indistinguishable from a malformed address.
    email = (JSON.parse(event.body ?? "{}") as { email?: unknown }).email
  } catch {
    return json(400, { status: "invalid" }, scope)
  }

  const result = await subscribe(email)

  if (result.status === "invalid") {
    scope.log.info({ msg: "newsletter.invalid" }, "newsletter subscribe: rejected at validation")
    return json(400, result, scope)
  }

  if (result.status === "error") {
    // Means "try again"; the body still says nothing about the address.
    scope.log.error({ msg: "newsletter.error" }, "newsletter subscribe: failed")
    return json(503, result, scope)
  }

  // Identical for a new, pending or confirmed address.
  return json(202, result, scope)
}
