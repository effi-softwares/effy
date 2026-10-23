import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { subject, type AuthedEvent } from "../lib/claims";
import { forbidden, json, noContent, preamble, unauthenticated, unavailable } from "../lib/http";
import type { LiveNamespace } from "./channel";
import { describeLive } from "./descriptor";

/**
 * The handler behind every audience's `GET /…/v1/live`. Its scope rule must be the live authorizer's
 * (`scope.ts`). 200 descriptor; 204 no live channel; 401 no subject; 403 no active record; 503 the
 * record could not be read.
 */
export function liveRoute(
  namespace: LiveNamespace,
  resolveScope: (sub: string) => Promise<string | null>,
): (event: AuthedEvent, context: Context) => Promise<APIGatewayProxyStructuredResultV2> {
  return async (event, context) => {
    const scope = preamble(event, context);
    const sub = subject(event);
    if (!sub) return unauthenticated(scope);

    let scopeId: string | null;
    try {
      scopeId = await resolveScope(sub);
    } catch (err) {
      scope.log.error({ err: err instanceof Error ? err.message : String(err) }, "live: scope check failed");
      return unavailable(scope);
    }
    if (scopeId === null) return forbidden(scope);

    const descriptor = describeLive({ namespace, scopeId });
    if (!descriptor) return noContent(scope);
    // Never cached: it carries the server's clock and depends on a record that can change.
    const res = json(200, descriptor, scope);
    return { ...res, headers: { ...res.headers, "cache-control": "no-store" } };
  };
}
