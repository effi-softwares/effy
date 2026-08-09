// POST /admin/v1/home-layout/publish — make the draft the page shoppers see (042 FR-013).
//
// ⚠ THE ONLY WRITE IN THIS SLICE WITH AN OUTSIDE EFFECT. It validates, copies draft to published, and
// tells the storefront to drop its cached structure — and a failure of that last step is reported to
// the operator rather than swallowed, because "published successfully" while shoppers see the old
// page is a lie they have no way to detect.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapLayoutError, requireRevision, toLayoutDTO } from "../homelayout/handler-support";
import { publish } from "../homelayout/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  try {
    const revision = requireRevision(JSON.parse(event.body ?? "{}"));
    return json(200, toLayoutDTO(await publish(revision, g.sub)), scope);
  } catch (err) {
    return mapLayoutError(err, scope);
  }
};
