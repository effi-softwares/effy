import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, unavailable } from "@effy/edge-shared";

import { requireStaff } from "../lib/guard";
import { NOT_FOUND, VALIDATION_FAILED } from "../lib/problems";
import { lookup } from "../lookup/service";

/** What a label, typed code or order number names. Any active staff. Every lookup is recorded as a read. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;
  const q = (event.queryStringParameters?.q ?? "").trim();
  if (q === "" || q.length > 64) {
    return problem(400, VALIDATION_FAILED, "Nothing to look up", "q must be a label, a code or an order number (up to 64 characters)", guard.scope);
  }
  const method = event.queryStringParameters?.method === "scan" ? "scan" : "typed";
  try {
    const found = await lookup(guard.sub, q, method);
    if (!found) {
      return problem(404, NOT_FOUND, "Not found", "Nothing matches that label, code or order number.", guard.scope);
    }
    return json(200, found, guard.scope);
  } catch (err) {
    guard.scope.log.error({ err }, "orders: lookup failed");
    return unavailable(guard.scope);
  }
};
