// Every shop's products, searched, filtered, sorted and paged on the server (102, a console list since 103). Read = any active staff, csa included.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, listProblem, parseListQuery, preamble } from "@effy/edge-shared";

import { denied, guard, mapProductAdminError } from "../products/handler-support";
import { PRODUCT_LIST_SPEC } from "../products/list";
import { list } from "../products/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return json(200, await list(parseListQuery(event.queryStringParameters, PRODUCT_LIST_SPEC)), scope);
  } catch (err) {
    return listProblem(err, scope) ?? mapProductAdminError(err, scope);
  }
};
