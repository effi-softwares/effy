// POST /admin/v1/home-layout/revert — discard the draft and return to the last published state
// (042 FR-014).
//
// ⚠ THIS IS "UNDO MY EDITS", NOT "UNDO MY PUBLISH". With two bodies and no history there is nothing
// behind `published` to go back to. The composer's copy says so too — an operator discovering that
// distinction at the moment they need the other behaviour is the worst possible time to learn it.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapLayoutError, requireRevision, toLayoutDTO } from "../homelayout/handler-support";
import { revert } from "../homelayout/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  try {
    const revision = requireRevision(JSON.parse(event.body ?? "{}"));
    return json(200, toLayoutDTO(await revert(revision, g.sub)), scope);
  } catch (err) {
    return mapLayoutError(err, scope);
  }
};
