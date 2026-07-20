// POST /shop/v1/fulfillments/{id}/status — advance or reverse a portion (020, US3).
//
// This is the endpoint that finally moves shop_fulfillment.status off `pending`, where 019 left it
// with no consumer. Concurrency-safe: a transition another operator already applied returns 200 with
// the current portion rather than an error (FR-014, SC-005).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { gate, mapFulfillmentError, toDetailDTO } from "../fulfillments/handler-support";
import { transition } from "../fulfillments/service";
import type { RequestableTransition } from "../fulfillments/types";

const REQUESTABLE: readonly string[] = ["picking", "ready_for_pickup"];

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;

  const id = event.pathParameters?.id;
  if (!id) return mapFulfillmentError(new Error("missing id"), scope);

  const parsed = parseJsonBody<Record<string, unknown>>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "a JSON body is required", scope, parsed.errors);
  }

  // `received` and `collected` are deliberately not requestable: the first is implicit on open
  // (FR-011a), the second belongs to the dev-only pickup stub alone (FR-030).
  const to = parsed.value.to;
  if (typeof to !== "string" || !REQUESTABLE.includes(to)) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "invalid target state", scope, [
        { field: "to", message: "must be one of: picking, ready_for_pickup" },
      ]);
  }

  try {
    return json(200, toDetailDTO(await transition(g.actor, id, to as RequestableTransition)), scope);
  } catch (err) {
    return mapFulfillmentError(err, scope);
  }
};
