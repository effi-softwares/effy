// PATCH /admin/v1/promotions/{id}/images/{imageId} — promotion pictures — update (095). Mutate: admin/manager.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { updateImage } from "../promotions/images";
import { guard, mapPromoError } from "../promotions/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  const id = event.pathParameters?.id ?? "";
  const imageId = event.pathParameters?.imageId ?? "";
  const body = () => JSON.parse(event.body ?? "{}") as Record<string, unknown>;
  try {
    return json(200, await updateImage(id, imageId, body(), g.sub), scope);
  } catch (err) {
    return mapPromoError(err, scope);
  }
};
