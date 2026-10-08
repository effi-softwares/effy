// GET /admin/v1/delivery/coverage — the list of postcodes Effy delivers to, its groups and courier reach (076). Read.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { list } from "../delivery/coverage.service";
import { guard, mapCoverageError } from "../delivery/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;
  try {
    const qs = event.queryStringParameters ?? {};
    return json(200, await list({ group: qs.group, q: qs.q, source: qs.source, review: qs.review, cursor: qs.cursor }), scope);
  } catch (err) {
    return mapCoverageError(err, scope);
  }
};
