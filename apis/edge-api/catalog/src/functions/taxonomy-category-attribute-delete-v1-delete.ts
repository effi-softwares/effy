// Remove a category's own attachment (101). Admin/manager.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { denied, guard, mapTaxonomyError } from "../taxonomy/handler-support";
import * as svc from "../taxonomy/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "decide");
  if (denied(g)) return g.deny;
  const id = () => event.pathParameters?.id ?? "";
  const attributeId = () => event.pathParameters?.attributeId ?? "";
  try {
    return json(200, await svc.detach(id(), attributeId(), g.sub), scope);
  } catch (err) {
    return mapTaxonomyError(err, scope);
  }
};
