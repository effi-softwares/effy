/**
 * The two shapes a commerce route takes.
 *
 *   customerRoute(fn)  a signed-in shopper. The gateway has verified the token; this resolves the
 *                      platform's own customer record and refuses a barred or closing shopper
 *                      BEFORE `fn` runs. There is no way to write an authenticated route that
 *                      skips the check, which is the point (070 FR-011).
 *   publicRoute(fn)    no shopper identity (cart preview, cart policy, the payment webhook).
 *
 * Both export through `shopperHandler`, so the shopper connection limit is answered as a retryable
 * 503 everywhere. `functions.guard.test.ts` fails the build on a function that uses neither.
 */
import {
  preamble, resolveCustomer, shopperHandler,
  type AuthedEvent, type RequestScope, type ResolvedCustomer,
} from "@effy/edge-shared";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";

export interface CustomerRequest {
  event: AuthedEvent;
  scope: RequestScope;
  customer: ResolvedCustomer;
}

export function customerRoute(fn: (req: CustomerRequest) => Promise<APIGatewayProxyStructuredResultV2>) {
  return shopperHandler<AuthedEvent>(async (event, context) => {
    const scope = preamble(event, context);
    const resolved = await resolveCustomer(event, scope);
    if (!resolved.ok) return resolved.response;
    return fn({ event, scope, customer: resolved.customer });
  });
}

export function publicRoute(
  fn: (req: { event: APIGatewayProxyEventV2; scope: RequestScope }) => Promise<APIGatewayProxyStructuredResultV2>,
) {
  return shopperHandler(async (event, context) => fn({ event, scope: preamble(event, context) }));
}

/** The request body as a JSON object, or null when it is absent, malformed or not an object. */
export function jsonBody(event: APIGatewayProxyEventV2): Record<string, unknown> | null {
  if (!event.body) return null;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * An optional integer field. Absent is 0 (the caller's rules decide what 0 means); present but not
 * a whole number is `null` — a malformed request, not a quantity to be rounded.
 */
export function intField(v: unknown): number | null {
  if (v === undefined || v === null) return 0;
  return typeof v === "number" && Number.isInteger(v) ? v : null;
}

/** An optional string field. Absent is ""; present but not a string is `null`. */
export function stringField(v: unknown): string | null {
  if (v === undefined || v === null) return "";
  return typeof v === "string" ? v : null;
}

export function queryParam(event: APIGatewayProxyEventV2, name: string): string {
  return new URLSearchParams(event.rawQueryString ?? "").get(name) ?? "";
}

export function pathParam(event: APIGatewayProxyEventV2, name: string): string {
  return event.pathParameters?.[name] ?? "";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An optional change id: "" when absent, the id when it is a uuid, `null` when it is anything else.
 *
 * ⚠ A change id is stored in a uuid column. One that is not a uuid would raise in the database and
 * be reported as the platform failing; it is the caller's malformed request and is answered as one.
 */
export function changeIdOf(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return "";
  return typeof v === "string" && UUID.test(v) ? v : null;
}
