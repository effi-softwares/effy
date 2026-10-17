import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { emitMetric, json, metricNamespace, problem } from "@effy/edge-shared";
import { announce } from "@effy/edge-shared/live";
import type { VehicleCheckRequest, VehicleCheckResponse } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { VehicleCheckError, submitVehicleCheck, validateAnswers } from "../vehicle/service";

/**
 * POST /driver/v1/vehicle-check (093) — the driver's check of the vehicle they hold, once a day. An
 * unsafe answer is told to dispatch at once; the driver is given no work until it is cleared.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;

  let body: VehicleCheckRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as VehicleCheckRequest;
  } catch {
    return problem(400, "invalid_request", "Malformed body", "The request body was not valid JSON.", guard.scope);
  }
  if (!body?.changeId) return problem(400, "invalid_request", "Missing changeId", "A changeId is required.", guard.scope);

  try {
    const answers = validateAnswers(body.answers);
    const r = await submitVehicleCheck(guard.driver.id, body.changeId, answers);
    if (r.recorded) {
      emitMetric(metricNamespace(), "VehicleChecks", 1, { result: r.state });
      // Dispatch's Exceptions list, and the planner's next pass picks the driver up (or leaves them out).
      await announce([{ scope: "ops", kind: "dispatch" }]);
    }
    const response: VehicleCheckResponse = { state: r.state };
    return json(200, response, guard.scope);
  } catch (err) {
    if (err instanceof VehicleCheckError) {
      return err.code === "no_vehicle"
        ? problem(409, "no_vehicle", "No vehicle", err.sentence, guard.scope)
        : problem(422, "validation_failed", "Cannot record that", err.sentence, guard.scope, [{ field: "answers", message: err.sentence }]);
    }
    throw err;
  }
};
