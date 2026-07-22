// POST /shop/v1/fulfillments/{id}/deliver — ⚠ DEV-ONLY SCAFFOLD (020 driver-stub tail).
//
// ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
// │ REMOVAL TRIGGER: delete this file, its serverless.yml block (there is none — see below), and   │
// │ repository.deliverViaStub()/service.deliverViaStub() when the driver slice ships (FR-034).      │
// │ DO NOT extend it in the meantime, and DO NOT add an httpApi route.                              │
// └──────────────────────────────────────────────────────────────────────────────────────────────┘
//
// The second half of the placeholder driver lifecycle: a picked-up (`collected`) portion is marked
// `delivered`. Exactly like the pickup stub, this accepts a CALLER-SUPPLIED driver identity, so it is
// a local script only — NEVER a deployed route (a reachable URL would be an order-state forgery
// primitive). It is invoked via scripts/invoke-deliver-stub.mjs; `POST .../deliver` is 404 everywhere.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { gate, mapFulfillmentError, toDetailDTO } from "../fulfillments/handler-support";
import { deliverViaStub } from "../fulfillments/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;

  const id = event.pathParameters?.id;
  if (!id) return mapFulfillmentError(new Error("missing id"), scope);

  const parsed = parseJsonBody<Record<string, unknown>>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "a JSON body is required", scope, parsed.errors);
  }

  const driverRef = parsed.value.driverRef;
  if (typeof driverRef !== "string") {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "driverRef is required", scope, [{ field: "driverRef", message: "must be a string" }]);
  }

  scope.log.warn({ fulfillmentId: id }, "DEV-ONLY deliver stub invoked");

  try {
    return json(200, toDetailDTO(await deliverViaStub(g.actor, id, driverRef)), scope);
  } catch (err) {
    return mapFulfillmentError(err, scope);
  }
};
