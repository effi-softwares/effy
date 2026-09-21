import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble, problem } from "@effy/edge-shared";
import type { ResolveExceptionRequest } from "@effy/shared-types";

import { ExceptionNotFoundError, resolveException } from "../exceptions/service";
import { mapDispatchError } from "../shared/dispatch-handler-support";
import { denied, guard } from "../shared/handler-support";

/**
 * POST /fleet/v1/exceptions/{exceptionId}/resolve (064, FR-021/FR-022).
 *
 * ⚠ MUTATE, NOT READ. Closing an exception asserts something about the physical world that no query
 * can verify — the package came back, went out again, or was written off — and it takes the item off
 * the list everyone else is working from. A `csa` may read every exception and may close none.
 */
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
    const result = await resolveException(exceptionId, g.sub, body.note?.trim() || null);
    return json(200, result, scope);
  } catch (err) {
    if (err instanceof ExceptionNotFoundError) {
      return problem(404, "not_found", "Not available", "That exception is not available.", scope);
    }
    return mapDispatchError(err, scope);
  }
};
