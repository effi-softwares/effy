// POST /shop/v1/team/{staffId}/deactivate — stand a colleague down (057 US7).
//
// ⚠ It disables the platform record AND the Cognito identity. The record alone is authoritative for
// access, but leaving a working identity behind means a valid session can still be minted — defense in
// depth, the same reasoning 009 applied.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { preamble } from "@effy/edge-shared";

import { gate, mapProductError } from "../products/handler-support";
import { deactivate } from "../team/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;
  try {
    await deactivate(g.shopId, g.sub, event.pathParameters?.staffId ?? "");
    return { statusCode: 204, headers: { "x-request-id": scope.requestId }, body: "" };
  } catch (err) {
    return mapProductError(err, scope);
  }
};
