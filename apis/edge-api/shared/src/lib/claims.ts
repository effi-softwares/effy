// Typed access to the gateway JWT claims; handlers own authorization. HTTP API stringifies every claim,
// so cognito:groups arrives as "[admin manager]" or "admin,manager", never an array.
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

export type AuthedEvent = APIGatewayProxyEventV2WithJWTAuthorizer;

export function claim(event: AuthedEvent, name: string): string | undefined {
  const value = event.requestContext.authorizer?.jwt?.claims?.[name];
  return typeof value === "string" ? value : undefined;
}

export function subject(event: AuthedEvent): string | undefined {
  return claim(event, "sub");
}

// parseGroups:
//  "[admin manager]" (HTTP API array-toString) → ["admin", "manager"]
//  "admin,manager" (REST API comma-join) → ["admin", "manager"]
//  "admin" (single group) → ["admin"]
//  "[]" / "" / absent (no groups) → []
// Group names with spaces or commas would be ambiguous; the platform uses none.
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

