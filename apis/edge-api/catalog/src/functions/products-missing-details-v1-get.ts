// Products on sale with a required detail empty — a requirement added after approval (101, FR-024). Read = any active staff.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, listProblem, parseListQuery, preamble } from "@effy/edge-shared";

import { missingDetails } from "../placements/service";
import { MISSING_DETAILS_SPEC } from "../review/list";
import { denied, guard, mapTaxonomyError } from "../taxonomy/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return json(200, await missingDetails(parseListQuery(event.queryStringParameters, MISSING_DETAILS_SPEC)), scope);
  } catch (err) {
    return listProblem(err, scope) ?? mapTaxonomyError(err, scope);
  }
};
