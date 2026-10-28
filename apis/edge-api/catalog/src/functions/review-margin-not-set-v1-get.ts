import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, listProblem, parseListQuery, preamble } from "@effy/edge-shared";

import { denied, guard, mapReviewError } from "../review/handler-support";
import { MARGIN_NOT_SET_SPEC } from "../review/list";
import { marginNotSet } from "../review/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return json(200, await marginNotSet(parseListQuery(event.queryStringParameters, MARGIN_NOT_SET_SPEC)), scope);
  } catch (err) {
    return listProblem(err, scope) ?? mapReviewError(err, scope);
  }
};
