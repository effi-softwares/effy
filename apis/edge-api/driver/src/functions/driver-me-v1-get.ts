import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json } from "@effy/edge-shared";

import { authenticate } from "../driver/guard";
import { toMeDTO } from "../driver/service";

/**
 * GET /driver/v1/me — the record-backed identity read (049).
 *
 * Reads the back-office-provisioned driver record for the token subject. Refuses (uniform 403) when
 * no record exists or the record is disabled — a valid driver-pool token never overrides the record
 * (Principle IV, research I2). No JIT upsert: a zone-less auto-created record could not be assigned.
 */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;
  return json(200, toMeDTO(guard.driver), guard.scope);
};
