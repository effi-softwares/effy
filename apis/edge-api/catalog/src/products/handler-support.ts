import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import type { RequestScope } from "@effy/edge-shared";
import { problem, ProblemType, unavailable } from "@effy/edge-shared";

import { ReviewError } from "../review/errors";
import { mapReviewError } from "../review/handler-support";
import { ProductAdminError } from "./errors";

export { denied, guard, parseBody } from "../review/handler-support";

const NOT_FOUND = "https://effyshopping.com/problems/not-found";

/** A review error raised by a shared step (margin, placements) maps as it does in review; anything unknown is 503. */
export function mapProductAdminError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  if (err instanceof ProductAdminError) {
    switch (err.kind) {
      case "validation":
        return problem(400, ProblemType.ValidationFailed, "Validation failed", err.message, scope, err.fields);
      case "not_found":
        return problem(404, NOT_FOUND, "Not found", err.message, scope);
      case "conflict":
        return problem(409, ProblemType.Conflict, "Conflict", err.message, scope, err.fields);
    }
  }
  if (err instanceof ReviewError) return mapReviewError(err, scope);
  scope.log.error({ err: err instanceof Error ? err.message : String(err) }, "catalog product operation failed");
  return unavailable(scope);
}
