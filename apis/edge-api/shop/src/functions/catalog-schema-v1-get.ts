// GET /shop/v1/catalog/schema — active types (+ assigned attributes) + active category tree.
// One call bootstraps the create form. Any active shop member.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { gate, mapProductError, toCatalogSchemaDTO } from "../products/handler-support";
import { getCatalogSchema } from "../products/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;
  try {
    return json(200, toCatalogSchemaDTO(await getCatalogSchema()), scope);
  } catch (err) {
    return mapProductError(err, scope);
  }
};
