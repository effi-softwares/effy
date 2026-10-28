import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, listProblem, parseListQuery } from "@effy/edge-shared";

import { mapStockError, shopGate } from "../stock/handler-support";
import { LOW_STOCK_LIST_SPEC } from "../stock/list";
import * as service from "../stock/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const g = await shopGate(event, context);
  if (!g.ok) return g.response;
  try {
    return json(200, await service.listLowStock(g.actor, parseListQuery(event.queryStringParameters, LOW_STOCK_LIST_SPEC)), g.scope);
  } catch (err) {
    return listProblem(err, g.scope) ?? mapStockError(err, g.scope);
  }
};
