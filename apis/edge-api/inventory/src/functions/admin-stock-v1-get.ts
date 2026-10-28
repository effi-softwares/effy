// Any active staff, csa included: support must see the number a shop is ringing about.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, listProblem, parseListQuery } from "@effy/edge-shared";

import { backOfficeGate, mapStockError } from "../stock/handler-support";
import { MOVEMENT_LIST_SPEC } from "../stock/list";
import * as service from "../stock/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const g = await backOfficeGate(event, context, "read");
  if (!g.ok) return g.response;

  const variantId = event.pathParameters?.variantId;
  if (!variantId) return mapStockError(new Error("missing variantId"), g.scope);

  try {
    // `?movements=page` asks for one page of the history alone (103); without it, the stock and its first page.
    const { movements, ...qs } = event.queryStringParameters ?? {};
    const req = parseListQuery(qs, MOVEMENT_LIST_SPEC);
    const body =
      movements === "page"
        ? await service.getMovementPage(g.actor, variantId, req)
        : await service.getStock(g.actor, variantId, req);
    return json(200, body, g.scope);
  } catch (err) {
    return listProblem(err, g.scope) ?? mapStockError(err, g.scope);
  }
};
