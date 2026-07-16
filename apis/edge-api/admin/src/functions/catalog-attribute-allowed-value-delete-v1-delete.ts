// DELETE /admin/v1/catalog/attributes/{id}/allowed-values/{valueId} — remove a value; in-use → 409 (FR-006). Mutate access.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapCatalogError, toAttributeDTO } from "../catalog/handler-support";
import { deleteAllowedValue } from "../catalog/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  try {
    return json(200, toAttributeDTO(await deleteAllowedValue(event.pathParameters?.id ?? "", event.pathParameters?.valueId ?? "", g.sub)), scope);
  } catch (err) {
    return mapCatalogError(err, scope);
  }
};
