import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, validationFailed } from "@effy/edge-shared";
import type { PointsCreditRequest } from "@effy/shared-types";

import { intField, objectBody, pointsProblem, textField } from "../customers/respond";
import { customerService } from "../customers/service";
import { requireStaff } from "../lib/guard";

/**
 * POST /orders/v1/customers/{customerId}/points/credit — staff credit points with a reason (074 US1).
 *
 * ⚠ GATE: any active staff — a customer-service agent's job includes making things right — but the
 * service holds a csa to the per-credit limit, decided from the staff RECORD (FR-007).
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;

  const body = objectBody(event.body);
  const points = intField(body?.points);
  const reason = textField(body?.reason);
  const note = textField(body?.note);
  const orderId = textField(body?.orderId);
  if (!body || points === null || reason === null || reason === "" || note === null || orderId === null) {
    return validationFailed(guard.scope, "a credit needs a whole number of points and a reason");
  }
  const req: PointsCreditRequest = { points, reason: reason as PointsCreditRequest["reason"], note, ...(orderId ? { orderId } : {}) };
  try {
    return json(201, await customerService.credit(guard.sub, event.pathParameters?.customerId ?? "", req), guard.scope);
  } catch (err) {
    return pointsProblem(guard.scope, err, "credit");
  }
};
