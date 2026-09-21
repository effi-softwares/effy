import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { json } from "@effy/edge-shared";
import { authenticate } from "../driver/guard";

/**
 * POST /driver/v1/activity/read (063).
 *
 * ⚠ ACCEPTS AND RECORDS NOTHING, AND SAYS SO HERE. The activity feed is DERIVED from rounds — there
 * is no per-driver read receipt to store, and inventing a table for one would create a second place
 * the truth about a driver's work lives. The route exists because the app calls it and a 404 on a
 * screen a driver uses is worse than an honest no-op; the day the feed earns a store, this is where
 * it goes.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;
  return json(200, { ok: true }, guard.scope);
};
