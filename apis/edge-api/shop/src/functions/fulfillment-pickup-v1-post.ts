// POST /shop/v1/fulfillments/{id}/pickup — ⚠ DEV-ONLY SCAFFOLD (020, US3a, FR-030…FR-034).
//
// ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
// │ REMOVAL TRIGGER: delete this file, its serverless.yml block, and repository.collectViaStub()  │
// │ when the driver slice ships a real dispatch path (FR-034). DO NOT extend it in the meantime.  │
// └──────────────────────────────────────────────────────────────────────────────────────────────┘
//
// WHY THE ROUTE IS CONDITIONALLY REGISTERED RATHER THAN FLAG-GUARDED HERE: this endpoint accepts a
// CALLER-SUPPLIED driver identity. If it were reachable in a deployed environment it would be an
// order-state forgery primitive — anyone able to reach the URL could mark any shop's order collected,
// with no real driver involved. A runtime flag is the wrong control because it can be misconfigured;
// the route is therefore ABSENT from the deployment unless the stage is local/dev (FR-031), so in
// dev the correct probe response is 404 (no such route), never 403. SC-013 requires proving that by
// ATTEMPTING to enable it, not by reading this comment.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { gate, mapFulfillmentError, toDetailDTO } from "../fulfillments/handler-support";
import { collectViaStub } from "../fulfillments/service";

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

  scope.log.warn({ fulfillmentId: id }, "DEV-ONLY pickup stub invoked");

  try {
    return json(200, toDetailDTO(await collectViaStub(g.actor, id, driverRef)), scope);
  } catch (err) {
    return mapFulfillmentError(err, scope);
  }
};
