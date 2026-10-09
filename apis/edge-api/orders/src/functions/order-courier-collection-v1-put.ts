// PUT /orders/v1/orders/{orderId}/courier-collection — via the hub, or pickup from the supplier, for one courier order (080). Write = admin/manager.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { isMediaValidationError, json, problem, unavailable } from "@effy/edge-shared";

import { consignmentError, changeCollection } from "../consignments/service";
import { requireWriter } from "../lib/guard";
import { VALIDATION_FAILED } from "../lib/problems";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireWriter(event, context);
  if (!guard.ok) return guard.response;
  const id = event.pathParameters?.orderId ?? "";

  let body: unknown;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return problem(400, VALIDATION_FAILED, "Malformed body", "the request body is not valid JSON", guard.scope);
  }

  try {
    return json(200, await changeCollection(id, body as never, guard.sub), guard.scope);
  } catch (err) {
    const refusal = consignmentError(err, guard.scope);
    if (refusal) return refusal;
    if (isMediaValidationError(err)) return problem(422, VALIDATION_FAILED, "Unsupported label", err.message, guard.scope);
    guard.scope.log.error({ err, id }, "orders: courier consignment change failed");
    return unavailable(guard.scope);
  }
};
