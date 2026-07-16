// DELETE /admin/v1/catalog/product-types/{id}/attributes/{attrId} — unassign. Mutate access.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapCatalogError, toProductTypeDTO } from "../catalog/handler-support";
import { unassignAttribute } from "../catalog/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  try {
    return json(200, toProductTypeDTO(await unassignAttribute(event.pathParameters?.id ?? "", event.pathParameters?.attrId ?? "", g.sub)), scope);
  } catch (err) {
    return mapCatalogError(err, scope);
  }
};
