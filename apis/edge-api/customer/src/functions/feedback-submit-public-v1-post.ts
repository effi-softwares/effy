import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import { json, preamble } from "@effy/edge-shared"

import { submitFeedback } from "../feedback/service"

/** Guests: public, never linked; the body email is unverified. Rate-limited by source IP. */
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

  // A stable sentinel when the IP is absent, so the rate-limit key is never empty.
  const sourceIp = event.requestContext?.http?.sourceIp ?? "unknown"

  const result = await submitFeedback(body, { kind: "guest", sourceIp })

  if (result.status === "invalid") return json(400, result, scope)
  if (result.status === "rate_limited") return json(429, result, scope)
  if (result.status === "error") return json(503, result, scope)
  return json(201, result, scope)
}
