// PUT /fleet/v1/shops/{shopId}/pack-scanning — require every bag to be scanned as packed (096 US4,
// FR-020). Write = admin/manager.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { validationError } from "../shared/errors";
import { denied, guard, mapFleetError, parseBody } from "../shared/handler-support";
import { setPackScanning } from "../shops/pack-scanning";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  try {
    const shopId = event.pathParameters?.shopId ?? "";
    if (!UUID.test(shopId)) throw validationError("no such shop", [{ field: "shopId", message: "must be a shop id" }]);
    const body = parseBody<{ required?: unknown }>(event.body);
    if (typeof body.required !== "boolean") {
      throw validationError("say whether pack scanning is required", [{ field: "required", message: "must be true or false" }]);
    }
    // No announcement: nothing a screen shows changes until the shop next marks an order ready.
    return json(200, await setPackScanning(shopId, body.required, g.sub), scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
