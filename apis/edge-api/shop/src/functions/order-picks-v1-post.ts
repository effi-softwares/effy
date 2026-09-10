// POST /shop/v1/orders/{id}/picks — item-level picking from the order console (057 A3 revision 2).
//
// Body: `{ lines: [{ orderItemId, mode: "full"|"part"|"unavailable"|"none", units?, note? }] }`. One
// line for a tick or an Adjust, every line for "Select all" / "Clear all" — all written in ONE
// transaction with their log entries. Ticking a received order starts picking (the tick is the start).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { gate, mapOrderError, toOrderDTO } from "../orders/handler-support";
import { setPicks } from "../orders/service";

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
    return json(200, toOrderDTO(await setPicks(g.actor, id, parsed.value)), scope);
  } catch (err) {
    return mapOrderError(err, scope);
  }
};
