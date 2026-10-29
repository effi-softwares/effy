// One product's activity in back-office (104). Read = any active staff, csa included, as the product page.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { activityResponse, preamble } from "@effy/edge-shared";

import { productActivitySource } from "../products/activity";
import { denied, guard, mapProductAdminError } from "../products/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return await activityResponse(event.queryStringParameters, scope, "bo-product", async () =>
      productActivitySource(event.pathParameters?.productId),
    );
  } catch (err) {
    return mapProductAdminError(err, scope);
  }
};
