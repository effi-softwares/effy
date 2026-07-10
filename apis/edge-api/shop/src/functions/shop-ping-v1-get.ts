// GET /shop/v1/ping — the shop/operator identity-enforcement proving route (shop pool). The
// shared gateway's shop JWT authorizer has AUTHENTICATED the caller (a cross-pool token never
// reaches here — Principle IV); this echoes the verified identity, proving the second cold-path
// service and its per-pool authorizer wiring end to end.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { groups, json, preamble, problem, ProblemType, subject } from "@effy/edge-shared";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);

  const sub = subject(event);
  if (!sub) {
    // Unreachable behind the authorizer; fail closed anyway.
    return problem(401, ProblemType.Unauthenticated, "Authentication required",
      "a valid access token for this audience is required", scope);
  }

  return json(200, {
    audience: "shop",
    subject: sub,
    groups: groups(event),
    message: "pong",
  }, scope);
};
