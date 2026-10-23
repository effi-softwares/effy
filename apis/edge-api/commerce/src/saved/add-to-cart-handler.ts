import { json, type RequestScope } from "@effy/edge-shared";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

import { jsonBody, stringField } from "../lib/route";
import { savedService } from "../lib/wiring";
import { savedError } from "./respond";

/** Always 200 once the list is found; `skipped` explains anything not added. */
export async function addListToCart(event: APIGatewayProxyEventV2, scope: RequestScope, customerId: string, listRef: string) {
  const changeId = stringField(jsonBody(event)?.changeId) ?? "";
  try {
    return json(200, await savedService.addAllToCart(customerId, listRef, changeId), scope);
  } catch (err) {
    return savedError(scope, err, "add to cart");
  }
}
