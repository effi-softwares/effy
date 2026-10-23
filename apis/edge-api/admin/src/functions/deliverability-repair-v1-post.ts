// Admin/manager: re-enabling a hard-failed address risks the shared sending reputation.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared"

import { guard, mapDeliverabilityError } from "../deliverability/handler-support"
import { repair } from "../deliverability/service"
import { emit } from "../lib/mail-metrics"

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context)
  const g = await guard(event, scope, "repair")
  if ("deny" in g) return g.deny

  const address = decodeURIComponent(event.pathParameters?.address ?? "")
  const parsed = parseJsonBody<{ note?: unknown }>(event.body)
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "a JSON body with a note is required", scope, parsed.errors)
  }

  const note = typeof parsed.value.note === "string" ? parsed.value.note : ""

  try {
    const result = await repair(address, g.sub, note)
    emit("mail_repair_performed")
    return json(200, result, scope)
  } catch (err) {
    return mapDeliverabilityError(err, scope)
  }
}
