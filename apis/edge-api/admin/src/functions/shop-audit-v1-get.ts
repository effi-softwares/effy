import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, listProblem, parseListQuery, preamble } from "@effy/edge-shared";

import { guard, mapShopError } from "../shops/handler-support";
import { SHOP_HISTORY_SPEC } from "../shops/list";
import { getShopHistory } from "../shops/service";

/** A shop's history, newest first: a keyset console list (103). */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  try {
    const req = parseListQuery(event.queryStringParameters, SHOP_HISTORY_SPEC);
    return json(200, await getShopHistory(event.pathParameters?.shopId ?? "", req), scope);
  } catch (err) {
    return listProblem(err, scope) ?? mapShopError(err, scope);
  }
};
