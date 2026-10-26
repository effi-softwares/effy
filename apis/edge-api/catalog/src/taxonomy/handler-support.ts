// The taxonomy routes' edge (101): the staff gate (read = any active staff, write = admin or manager, from
// `admin.staff`), the refusal → problem mapping, and the body parse.
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import type { RequestScope } from "@effy/edge-shared";
import { problem, ProblemType, unavailable } from "@effy/edge-shared";
import { TaxonomyRefusal } from "@effy/edge-shared/catalog";

export { denied, guard } from "../review/handler-support";

const NOT_FOUND = "https://effyshopping.com/problems/not-found";

/** The problem body with the refusal's machine word added as `code`. */
function withCode(res: APIGatewayProxyStructuredResultV2, code: string): APIGatewayProxyStructuredResultV2 {
  return { ...res, body: JSON.stringify({ ...JSON.parse(res.body as string), code }) };
}

/** A refusal carries its `code` (the machine word clients branch on); anything else is 503, logged. */
export function mapTaxonomyError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  if (err instanceof TaxonomyRefusal) {
    switch (err.kind) {
      case "validation":
        return withCode(problem(400, ProblemType.ValidationFailed, "Validation failed", err.message, scope, err.fields), err.code);
      case "not_found":
        return withCode(problem(404, NOT_FOUND, "Not found", err.message, scope), err.code);
      case "conflict":
        return withCode(problem(409, ProblemType.Conflict, "Conflict", err.message, scope, err.fields), err.code);
    }
  }
  scope.log.error({ err: err instanceof Error ? err.message : String(err) }, "taxonomy operation failed");
  return unavailable(scope);
}

export function parseTaxonomyBody<T>(raw: string | undefined): T {
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new TaxonomyRefusal("validation", "invalid_body", "the request body is not valid JSON");
  }
}
