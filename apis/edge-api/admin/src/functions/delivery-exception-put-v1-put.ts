// PUT /admin/v1/delivery/zones/{zoneId}/sameday-exceptions {shopId, mode} — force a shop on/off for
// same-day in a zone (047 US3, FR-043). Back-office only; no shop-side path (FR-045). Mutate.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import { guard, mapDeliveryError } from "../delivery/handler-support";
import { upsertException } from "../delivery/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  const zoneId = event.pathParameters?.zoneId ?? "";
  try {
    const body = JSON.parse(event.body ?? "{}");
    return json(200, { items: await upsertException(body.shopId ?? "", zoneId, body.mode ?? "", g.sub) }, scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
