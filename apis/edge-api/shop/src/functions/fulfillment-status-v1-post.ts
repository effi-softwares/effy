// A transition another operator already applied returns 200 with the current portion.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { gate, mapFulfillmentError, toDetailDTO } from "../fulfillments/handler-support";
import { transition } from "../fulfillments/service";
import { REQUESTABLE_TRANSITIONS } from "../fulfillments/types";
import type { RequestableTransition } from "../fulfillments/types";

const REQUESTABLE: readonly string[] = REQUESTABLE_TRANSITIONS;

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

  // `received` is implicit on open and `collected` is driver work; `withdrawn` is cancellation's alone.
  const to = parsed.value.to;
  if (typeof to !== "string" || !REQUESTABLE.includes(to)) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "invalid target state", scope, [
        { field: "to", message: `must be one of: ${REQUESTABLE.join(", ")}` },
      ]);
  }

  try {
    // The reason is required for `unfulfillable` (and by a check).
    const reason = typeof parsed.value.reason === "string" ? parsed.value.reason : undefined;
    return json(
      200,
      toDetailDTO(await transition(g.actor, id, to as RequestableTransition, reason)),
      scope,
    );
  } catch (err) {
    return mapFulfillmentError(err, scope);
  }
};
