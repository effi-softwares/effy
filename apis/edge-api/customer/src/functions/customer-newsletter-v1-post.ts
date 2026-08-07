import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import { json, preamble } from "@effy/edge-shared"

import { subscribe } from "../newsletter/service"

/**
 * POST /customer/v1/newsletter — subscribe to Effy updates (039 US6).
 *
 * ⚠ PUBLIC — no authorizer, deliberately. Subscribing must work for an anonymous visitor who has no
 * account and may never have one; putting it behind the customer JWT authorizer would make it
 * unreachable by the people it exists for. Same posture as `healthz`/`readyz` on this service.
 *
 * ⚠ THE UNTYPED EVENT IS THE POINT. Every other route in this service takes `AuthedEvent` and resolves
 * a caller. This one has no caller, so there is nothing to resolve and nothing to authorize — the only
 * input is a string in the body.
 *
 * ⚠ 202, NOT 201. "Accepted" is honest: the subscription is recorded but not yet real — nobody is
 * subscribed until they follow the emailed link. A 201 Created would claim a resource that a
 * double-opt-in flow deliberately has not created.
 */
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context)

  let email: unknown
  try {
    // ⚠ A malformed body is `invalid`, not a 500. It is the same class of caller error as a malformed
    // address, and it must not be distinguishable from one.
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
    // ⚠ 503, so the client can distinguish "try again" from "your address is wrong". The BODY still
    // says nothing about the address — the distinction is about our availability, not their identity.
    scope.log.error({ msg: "newsletter.error" }, "newsletter subscribe: failed")
    return json(503, result, scope)
  }

  // ⚠ IDENTICAL for a new address, one already pending, and one already confirmed (FR-032). There is
  // deliberately no branch here that could make them tell apart.
  return json(202, result, scope)
}
