import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { subject, type AuthedEvent } from "../lib/claims";
import { forbidden, json, noContent, preamble, unauthenticated, unavailable } from "../lib/http";
import type { LiveNamespace } from "./channel";
import { describeLive } from "./descriptor";

/**
 * 071 — the handler behind every audience's `GET /…/v1/live`: which channel is this person's.
 *
 * One implementation, four routes — each in its own audience's service, behind that audience's own
 * gateway authorizer, differing only in how the scope is resolved. The scope rule handed in MUST be
 * the same one the live authorizer applies (`scope.ts`), or an app is handed a channel it is then
 * refused.
 *
 *   200  the descriptor
 *   204  this environment has no live channel — the app shows "live updates off" and reads on
 *        open, on return and on request, which is a supported state
 *   401  no verified subject
 *   403  no active platform record — the same uniform refusal every other route gives
 *   503  the record could not be read; a failed check is never a grant
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
    // Never cached: it carries the server's clock, and whose channel it names depends on a record
    // that can change.
    const res = json(200, descriptor, scope);
    return { ...res, headers: { ...res.headers, "cache-control": "no-store" } };
  };
}
