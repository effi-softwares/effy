import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, listProblem, parseListQuery, preamble } from "@effy/edge-shared";

import { denied, guard, mapReviewError } from "../review/handler-support";
import { REVIEW_QUEUE_SPEC } from "../review/list";
import { queue, queueViewCounts } from "../review/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    // A console list (103); `?views=only` answers the kinds' counts instead of a page.
    const req = parseListQuery(event.queryStringParameters, REVIEW_QUEUE_SPEC);
    if (req.viewsOnly) return json(200, { views: await queueViewCounts(req) }, scope);
    return json(200, await queue(req), scope);
  } catch (err) {
    return listProblem(err, scope) ?? mapReviewError(err, scope);
  }
};
