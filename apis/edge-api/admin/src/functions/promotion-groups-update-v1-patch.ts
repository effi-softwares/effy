// PATCH /admin/v1/promotion-groups/{id} — display groups (094 US2). Mutate: admin/manager.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { updateGroup } from "../promotion-groups/service";
import { guard, mapPromoError } from "../promotions/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  const id = event.pathParameters?.id ?? "";
  const body = () => JSON.parse(event.body ?? "{}") as Record<string, unknown>;
  try {
    return json(200, await updateGroup(id, body(), g.sub), scope);
  } catch (err) {
    return mapPromoError(err, scope);
  }
};
