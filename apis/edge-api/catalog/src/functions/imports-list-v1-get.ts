// Imports, newest first, optionally for one shop (102). Read = any active staff incl. csa.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, listProblem, parseListQuery, preamble } from "@effy/edge-shared";

import { IMPORT_LIST_SPEC } from "../imports/list";
import { list } from "../imports/service";
import { denied, guard, mapProductAdminError } from "../products/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return json(200, await list(parseListQuery(event.queryStringParameters, IMPORT_LIST_SPEC)), scope);
  } catch (err) {
    return listProblem(err, scope) ?? mapProductAdminError(err, scope);
  }
};
