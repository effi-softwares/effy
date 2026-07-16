// GET /admin/v1/catalog/categories — flat list (parentId-linked; tree built client-side). Read access.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapCatalogError, toCategoryDTO } from "../catalog/handler-support";
import { listCategories } from "../catalog/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;
  try {
    return json(200, (await listCategories()).map(toCategoryDTO), scope);
  } catch (err) {
    return mapCatalogError(err, scope);
  }
};
