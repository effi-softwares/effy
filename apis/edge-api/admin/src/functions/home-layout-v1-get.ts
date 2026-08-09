// GET /admin/v1/home-layout — both bodies, the revision, and who last touched them (042 FR-001).
// Read-open to any active staff: seeing what the storefront says is support work, and it discloses
// nothing a shopper cannot already see for themselves.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapLayoutError, toLayoutDTO } from "../homelayout/handler-support";
import { getLayout } from "../homelayout/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  try {
    return json(200, toLayoutDTO(await getLayout()), scope);
  } catch (err) {
    return mapLayoutError(err, scope);
  }
};
