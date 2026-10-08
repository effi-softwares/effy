// DELETE /admin/v1/delivery/coverage/postcodes/{postcode} — take a postcode off the list; placed orders are untouched (076 FR-005). Mutate.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { noContent, preamble } from "@effy/edge-shared";

import { removePostcode } from "../delivery/coverage.service";
import { guard, mapCoverageError } from "../delivery/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  try {
    await removePostcode(event.pathParameters?.postcode ?? "", g.sub);
    return noContent(scope);
  } catch (err) {
    return mapCoverageError(err, scope);
  }
};
