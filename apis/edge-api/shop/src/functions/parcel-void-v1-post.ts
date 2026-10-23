// Bag 1 never; once printed, only the last.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { gate, mapOrderError, toOrderDTO } from "../orders/handler-support";
import * as parcels from "../parcels/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;

  const id = event.pathParameters?.id;
  if (!id) return mapOrderError(new Error("missing id"), scope);
  const parcelId = event.pathParameters?.parcelId;
  if (!parcelId) return mapOrderError(new Error("missing parcel id"), scope);
  const parsed = parseJsonBody<Record<string, unknown>>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "a JSON body is required", scope, parsed.errors);
  }

  try {
    return json(200, toOrderDTO(await parcels.voidBag(g.actor, id, parcelId, parsed.value)), scope);
  } catch (err) {
    return mapOrderError(err, scope);
  }
};
