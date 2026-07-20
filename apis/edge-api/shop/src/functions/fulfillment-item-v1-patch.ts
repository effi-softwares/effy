// PATCH /shop/v1/fulfillments/{id}/items/{orderItemId} — record picking progress (020, US2).
//
// Absolute quantities, never deltas, so a retry on a flaky shop tablet is idempotent. Flagging an
// item unavailable records a SHORTFALL and moves NO money (FR-010b) — the customer keeps paying for
// something they will not receive, and that debt is left queryable for a later refunds slice.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { gate, mapFulfillmentError, toDetailDTO } from "../fulfillments/handler-support";
import { updateItemProgress } from "../fulfillments/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;

  const id = event.pathParameters?.id;
  const orderItemId = event.pathParameters?.orderItemId;
  if (!id || !orderItemId) return mapFulfillmentError(new Error("missing id"), scope);

  const parsed = parseJsonBody<Record<string, unknown>>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "a JSON body is required", scope, parsed.errors);
  }

  try {
    const detail = await updateItemProgress(g.actor, id, orderItemId, parsed.value);
    return json(200, toDetailDTO(detail), scope);
  } catch (err) {
    return mapFulfillmentError(err, scope);
  }
};
