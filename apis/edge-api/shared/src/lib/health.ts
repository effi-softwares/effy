// The two probes every service exposes, public and unversioned:
//  healthz (liveness) touches nothing; fails only if the service is not deployed or not running.
//  readyz (readiness) probes the database under a time budget; 503 means alive but not usable.
// Split, they localise a fault: 200/200 healthy, 200/503 the database, ✗ the service itself.
// Neither body ever names a host, a credential or a driver error.
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { pingDatabase } from "./db";
import { json, preamble } from "./http";

// A hard ceiling, so a hung database makes the probe report the outage rather than become it.
const PROBE_BUDGET_MS = 2_000;

type EdgeHandler = (
  event: APIGatewayProxyEventV2,
  context: Context,
) => Promise<APIGatewayProxyStructuredResultV2>;

/** Reaching it is the assertion; `service` says which service answered behind a shared gateway. */
export function livenessHandler(service: string): EdgeHandler {
  return async (event, context) => {
    const scope = preamble(event, context);
    return json(200, { status: "ok", service }, scope);
  };
}

/** Safe to serve. 503: alive but not usable; back off. A cold start is slower, not a fault. */
export function readinessHandler(service: string): EdgeHandler {
  return async (event, context) => {
    const scope = preamble(event, context);

    try {
      await Promise.race([
        pingDatabase(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("readyz: database probe timed out")),
            PROBE_BUDGET_MS,
          ),
        ),
      ]);
    } catch (err) {
      // Logged with the error, returned without it.
      scope.log.warn({ err }, "readiness: database unreachable");
      return json(
        503,
        { status: "unavailable", service, checks: { database: "unreachable" } },
        scope,
      );
    }

    scope.log.debug("readiness ok");
    return json(200, { status: "ready", service, checks: { database: "ok" } }, scope);
  };
}
