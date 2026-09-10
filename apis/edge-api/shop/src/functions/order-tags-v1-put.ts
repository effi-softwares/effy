// PUT /shop/v1/orders/{id}/tags — replace the order's tag set (057 A3).
//
// The body is the ABSOLUTE set, never an add/remove delta, so a retried save lands the same result. A
// save that changes nothing writes nothing — not even a log entry.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { gate, mapOrderError, toOrderDTO } from "../orders/handler-support";
import { setTags } from "../orders/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;

  const id = event.pathParameters?.id;
  if (!id) return mapOrderError(new Error("missing id"), scope);

  const parsed = parseJsonBody<Record<string, unknown>>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "a JSON body is required", scope, parsed.errors);
  }

  try {
    return json(200, toOrderDTO(await setTags(g.actor, id, parsed.value)), scope);
  } catch (err) {
    return mapOrderError(err, scope);
  }
};
