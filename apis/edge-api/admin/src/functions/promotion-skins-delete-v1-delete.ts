import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { noContent, preamble } from "@effy/edge-shared";

import { deleteSkin } from "../promotion-skins/service";
import { guard, mapPromoError } from "../promotions/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  const id = event.pathParameters?.id ?? "";
  try {
    await deleteSkin(id, g.sub);
    return noContent(scope);
  } catch (err) {
    return mapPromoError(err, scope);
  }
};
