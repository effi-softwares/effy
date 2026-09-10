// POST /shop/v1/orders/{id}/notes — add an internal note to the order (057 A3).
//
// Append-only: there is no edit or delete route, so a note someone acted on cannot be rewritten
// afterwards. Never shown to the customer or to another shop.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { gate, mapOrderError, toOrderDTO } from "../orders/handler-support";
import { addNote } from "../orders/service";

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
    return json(201, toOrderDTO(await addNote(g.actor, id, parsed.value)), scope);
  } catch (err) {
    return mapOrderError(err, scope);
  }
};
