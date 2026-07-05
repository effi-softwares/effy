// Typed access to the gateway JWT authorizer's claims. The gateway is the
// AUTHENTICATION boundary (per-pool JWT authorizers — research C7); handlers own
// AUTHORIZATION via these helpers. HTTP API stringifies every claim value, so
// cognito:groups arrives as "[admin manager]" (observed HTTP API form) or
// "admin,manager" (REST form) — never trust it to be an array (research D3).
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

export type AuthedEvent = APIGatewayProxyEventV2WithJWTAuthorizer;

export function claim(event: AuthedEvent, name: string): string | undefined {
  const value = event.requestContext.authorizer?.jwt?.claims?.[name];
  return typeof value === "string" ? value : undefined;
}

export function subject(event: AuthedEvent): string | undefined {
  return claim(event, "sub");
}

// parseGroups handles every observed serialization of cognito:groups, defensively:
//   "[admin manager]"  (HTTP API array-toString)   → ["admin", "manager"]
//   "admin,manager"    (REST API comma-join)       → ["admin", "manager"]
//   "admin"            (single group)              → ["admin"]
//   "[]" / "" / absent (group-less user — NO claim) → []
// Group names containing spaces or commas are ambiguous here — the platform does not
// use such names (admin/manager/csa).
export function parseGroups(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  let s = raw.trim();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  return s
    .split(/[\s,]+/)
    .map((g) => g.trim())
    .filter((g) => g.length > 0);
}

export function groups(event: AuthedEvent): string[] {
  return parseGroups(claim(event, "cognito:groups"));
}

// hasAnyGroup: absent claim = empty set = deny; exact-case comparison (Cognito group
// names are case-sensitive identifiers). Any group hierarchy lives HERE, never in
// individual handlers (research D4).
export function hasAnyGroup(event: AuthedEvent, allowed: readonly string[]): boolean {
  const held = groups(event);
  return held.some((g) => allowed.includes(g));
}
