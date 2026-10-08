import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, validationFailed } from "@effy/edge-shared";
import type { PointsDebitRequest } from "@effy/shared-types";

import { intField, objectBody, pointsProblem, textField } from "../customers/respond";
import { customerService } from "../customers/service";
import { requireWriter } from "../lib/guard";

/**
 * POST /orders/v1/customers/{customerId}/points/debit — correct a balance (074 US5).
 * ⚠ WRITE GATE: admin|manager from the staff record. A csa may credit but never debit (FR-008).
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireWriter(event, context);
  if (!guard.ok) return guard.response;

  const body = objectBody(event.body);
  const points = intField(body?.points);
  const reason = textField(body?.reason);
  const note = textField(body?.note);
  if (!body || points === null || reason === null || reason === "" || note === null) {
    return validationFailed(guard.scope, "a debit needs a whole number of points and a reason");
  }
  const req: PointsDebitRequest = { points, reason: reason as PointsDebitRequest["reason"], note };
  try {
    return json(201, await customerService.debit(guard.sub, event.pathParameters?.customerId ?? "", req), guard.scope);
  } catch (err) {
    return pointsProblem(guard.scope, err, "debit");
  }
};
