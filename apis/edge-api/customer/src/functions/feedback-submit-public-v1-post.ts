import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import { json, preamble } from "@effy/edge-shared"

import { submitFeedback } from "../feedback/service"

/**
 * POST /customer/v1/feedback/public — submit feedback as a GUEST (046 US1).
 *
 * ⚠ PUBLIC — no authorizer, deliberately. Being heard must not require an account (the checkout header
 * that links here is guest-reachable). A body email is UNVERIFIED and used only to send the
 * acknowledgement/reply; the submission is never linked to any account (research D2).
 *
 * ⚠ THE RATE LIMIT IS KEYED ON THE SOURCE IP, which — unlike 035's Cognito trigger — the HTTP API v2
 * event actually carries at `requestContext.http.sourceIp`. That is the one identifier available for a
 * caller with no `sub`.
 */
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context)

  let body: unknown
  try {
    body = JSON.parse(event.body ?? "{}")
  } catch {
    return json(400, { status: "invalid", field: "message" }, scope)
  }

  // ⚠ Fall back to a stable sentinel if the IP is somehow absent, so the rate-limit key is never empty
  // (an empty key would disable the cap). "unknown" buckets all such callers together — conservative.
  const sourceIp = event.requestContext?.http?.sourceIp ?? "unknown"

  const result = await submitFeedback(body, { kind: "guest", sourceIp })

  if (result.status === "invalid") return json(400, result, scope)
  if (result.status === "rate_limited") return json(429, result, scope)
  if (result.status === "error") return json(503, result, scope)
  return json(201, result, scope)
}
