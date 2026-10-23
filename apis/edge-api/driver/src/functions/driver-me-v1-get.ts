import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json } from "@effy/edge-shared";

import { authenticate } from "../driver/guard";
import { toMeDTO } from "../driver/service";

/** Uniform 403 when there is no record or it is not active; never created here. */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;
  return json(200, toMeDTO(guard.driver), guard.scope);
};
