// GET /healthz — public, unversioned. One function carries liveness AND readiness
// (API Gateway has no probe split): reaching the handler proves the process; the DB
// probe under a 2s budget proves the dependency (contracts/edge-api.contract.md).
// A cold start makes the first call slower — documented tolerance, not an error.
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { json, preamble } from "../lib/http";
import { pingDatabase } from "../repository";

const PROBE_BUDGET_MS = 2_000;

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);

  try {
    await Promise.race([
      pingDatabase(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("health: database probe timed out")), PROBE_BUDGET_MS),
      ),
    ]);
  } catch (err) {
    scope.log.warn({ err }, "readiness: database unreachable");
    // Plain status body, not a problem document — probes read status codes; the body
    // never names hosts or credentials (data-model §3).
    return json(503, { status: "unavailable", checks: { database: "unreachable" } }, scope);
  }

  scope.log.debug("health ok");
  return json(200, { status: "ready", checks: { database: "ok" } }, scope);
};
