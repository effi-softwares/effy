// PUT /admin/v1/home-layout/draft — replace the draft body (042 FR-002/FR-004/FR-005).
//
// ⚠ THIS NEVER TOUCHES WHAT SHOPPERS SEE. A draft is work in progress and is validated only for
// structure; the content rules are applied at publish, so an operator can save a half-written tile
// and come back to it.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapLayoutError, requireRevision, toLayoutDTO } from "../homelayout/handler-support";
import { saveDraft } from "../homelayout/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  try {
    const body = JSON.parse(event.body ?? "{}") as { blocks?: unknown };
    const revision = requireRevision(body);
    return json(200, toLayoutDTO(await saveDraft(body.blocks, revision, g.sub)), scope);
  } catch (err) {
    return mapLayoutError(err, scope);
  }
};
