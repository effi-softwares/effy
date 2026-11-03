import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType, subject, unavailable } from "@effy/edge-shared";
import { changeTourState } from "@effy/edge-shared/tours";

const TOUR_STATE_FULL = "https://effyshopping.com/problems/tour-state-full";

/**
 * One change to the caller's own guided-tour state (106, 107): a tour's outcome, the offer switch, or a reset. Answers
 * with the new state, so the console replaces its copy with what the server holds.
 */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const sub = subject(event);
  if (!sub) {
    return problem(401, ProblemType.Unauthenticated, "Authentication required", "a valid back-office token is required", scope);
  }

  const body = parseJsonBody<Record<string, unknown>>(event.body);
  if (body.errors.length > 0 || body.value === undefined) {
    return problem(
      400,
      ProblemType.ValidationFailed,
      "Invalid request",
      body.errors[0]?.message ?? "the request body is not valid JSON",
      scope,
    );
  }

  try {
    const result = await changeTourState("admin", sub, body.value);
    if (result.ok) return json(200, result.state, scope);
    if (result.refused === "invalid") {
      return problem(400, ProblemType.ValidationFailed, "Invalid request", result.message, scope);
    }
    return problem(409, TOUR_STATE_FULL, "Too many tours", "this person's tour record is full", scope);
  } catch (err) {
    scope.log.error({ err, sub }, "tours: write failed");
    return unavailable(scope);
  }
};
