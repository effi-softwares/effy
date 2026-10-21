// GET /admin/v1/promotion-skins/{id} — promotion skins — read (095). Read: any active staff, incl. csa.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { readSkin } from "../promotion-skins/service";
import { guard, mapPromoError } from "../promotions/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;
  const id = event.pathParameters?.id ?? "";
  try {
    return json(200, await readSkin(id), scope);
  } catch (err) {
    return mapPromoError(err, scope);
  }
};
