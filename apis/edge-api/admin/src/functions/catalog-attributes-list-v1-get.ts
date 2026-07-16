// GET /admin/v1/catalog/attributes — list attribute definitions (+ allowed values). Read access.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapCatalogError, toAttributeDTO } from "../catalog/handler-support";
import { listAttributes } from "../catalog/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;
  try {
    return json(200, (await listAttributes()).map(toAttributeDTO), scope);
  } catch (err) {
    return mapCatalogError(err, scope);
  }
};
