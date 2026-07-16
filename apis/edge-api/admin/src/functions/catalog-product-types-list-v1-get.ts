// GET /admin/v1/catalog/product-types — list all types incl. their assigned attributes. Read access.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapCatalogError, toProductTypeDTO } from "../catalog/handler-support";
import { listProductTypes } from "../catalog/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;
  try {
    return json(200, (await listProductTypes()).map(toProductTypeDTO), scope);
  } catch (err) {
    return mapCatalogError(err, scope);
  }
};
