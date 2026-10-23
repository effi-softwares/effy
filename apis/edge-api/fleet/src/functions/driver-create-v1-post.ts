// Admin/manager: a record plus a sign-in, together.
import { announceDispatch } from "../lib/live";
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import type { AdminDriverCreateRequest } from "@effy/shared-types";

import { denied, guard, mapFleetError, parseBody } from "../shared/handler-support";
import { createDriver } from "../drivers/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  try {
    const body = parseBody<AdminDriverCreateRequest>(event.body);
    const created = await createDriver(body, g.sub, scope);
    await announceDispatch();
    return json(201, created, scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
