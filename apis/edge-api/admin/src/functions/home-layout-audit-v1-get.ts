// GET /admin/v1/home-layout/audit — who changed the page and when (042 FR-015).
//
// ⚠ THIS IS THE SLICE'S ONLY ACCOUNTABILITY CONTROL. Every member of staff who can compose has the
// same powers, so the log is the only thing that can answer "who took that section down". Read-open
// to active staff, like the layout itself.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapLayoutError, toAuditDTO } from "../homelayout/handler-support";
import { getAudit } from "../homelayout/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  try {
    const raw = Number(event.queryStringParameters?.limit);
    const limit = Number.isFinite(raw) && raw > 0 ? raw : undefined;
    return json(200, { items: (await getAudit(limit)).map(toAuditDTO) }, scope);
  } catch (err) {
    return mapLayoutError(err, scope);
  }
};
