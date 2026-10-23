import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { announceDispatch } from "../lib/live";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble, problem } from "@effy/edge-shared";
import type { ResolveExceptionRequest } from "@effy/shared-types";

import { ExceptionNotFoundError, ExceptionOutcomeError, resolveException } from "../exceptions/service";
import { mapDispatchError } from "../shared/dispatch-handler-support";
import { denied, guard } from "../shared/handler-support";

/** Admin/manager: it asserts something about the physical world. A csa may read every exception and close none. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;

  const exceptionId = event.pathParameters?.exceptionId;
  if (!exceptionId) {
    return problem(400, "invalid_request", "Missing exception", "An exceptionId is required.", scope);
  }

  let body: ResolveExceptionRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as ResolveExceptionRequest;
  } catch {
    return problem(400, "invalid_request", "Malformed body", "The request body was not valid JSON.", scope);
  }

  try {
    const result = await resolveException(exceptionId, g.sub, body.note?.trim() || null, body.outcome ?? null);
    await announceDispatch();
    return json(200, result, scope);
  } catch (err) {
    if (err instanceof ExceptionOutcomeError) {
      return problem(400, "invalid_request", "Can't record that outcome", err.message, scope);
    }
    if (err instanceof ExceptionNotFoundError) {
      return problem(404, "not_found", "Not available", "That exception is not available.", scope);
    }
    return mapDispatchError(err, scope);
  }
};
