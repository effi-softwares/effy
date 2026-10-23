// Submits a never-approved product for review; it stays off sale until Effy approves it and sets the margin.
import { announce } from "@effy/edge-shared/live";
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { gate, mapProductError, toDetailDTO } from "../products/handler-support";
import { submitForReview } from "../products/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;
  try {
    const submitted = await submitForReview(g.shopId, event.pathParameters?.id ?? "");
    await announce([{ scope: "ops", kind: "review" }]);
    return json(200, toDetailDTO(submitted), scope);
  } catch (err) {
    return mapProductError(err, scope);
  }
};
