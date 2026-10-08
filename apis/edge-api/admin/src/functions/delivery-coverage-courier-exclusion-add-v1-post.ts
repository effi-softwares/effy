// POST /admin/v1/delivery/coverage/courier/exclusions — exclude a postcode from courier delivery (076 FR-018). Mutate.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { noContent, preamble } from "@effy/edge-shared";

import { addExclusion } from "../delivery/coverage.service";
import { guard, mapCoverageError } from "../delivery/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  try {
    const body = JSON.parse(event.body || "{}");
    await addExclusion(body, g.sub);
    return { ...noContent(scope), statusCode: 201 };
  } catch (err) {
    return mapCoverageError(err, scope);
  }
};
