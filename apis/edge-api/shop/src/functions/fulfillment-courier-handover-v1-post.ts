// Only for a booked courier pickup from this shop; anything else is the same 403. A repeat answers the same.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { gate, mapFulfillmentError, toDetailDTO } from "../fulfillments/handler-support";
import { courierHandover } from "../fulfillments/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;

  const id = event.pathParameters?.id;
  if (!id) return mapFulfillmentError(new Error("missing id"), scope);

  // Optional: a reference the courier read out when the label had none.
  const parsed = event.body ? parseJsonBody<Record<string, unknown>>(event.body) : { value: {} as Record<string, unknown>, errors: [] };
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "the body is not JSON", scope, parsed.errors);
  }
  const ref = parsed.value.reference;
  if (ref !== undefined && ref !== null && (typeof ref !== "string" || ref.trim().length > 100)) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "invalid reference", scope,
      [{ field: "reference", message: "up to 100 characters" }]);
  }

  try {
    // Optional: how each bag was handed over; the rest went by hand.
    const parcels = Array.isArray(parsed.value.parcels) ? (parsed.value.parcels as unknown[]).slice(0, 50) : undefined;
    return json(200, toDetailDTO(await courierHandover(
      g.actor, id, typeof ref === "string" && ref.trim() !== "" ? ref.trim() : null, parcels as never,
    )), scope);
  } catch (err) {
    return mapFulfillmentError(err, scope);
  }
};
