/**
 * Verified subject → platform customer for every signed-in shopper route. A barred customer, or one
 * whose account is closing, is refused whatever the token says. Read on every request, never cached.
 * The two 403s are indistinguishable, and a missing record is the same 401 as any sign-in failure.
 */
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import { subject, type AuthedEvent } from "./claims";
import { query } from "./db";
import { forbidden, unauthenticated, type RequestScope } from "./http";

export interface ResolvedCustomer {
  /** `public.customer.id`: what every commerce query is scoped by. */
  id: string;
  sub: string;
}

export type CustomerResolution =
  | { ok: true; customer: ResolvedCustomer }
  | { ok: false; response: APIGatewayProxyStructuredResultV2 };

export interface CustomerRow {
  id: string;
  status: string;
  closure_state: string;
}

/** Exported for the container test. */
export const CUSTOMER_BY_SUB = `SELECT id::text AS id, status, closure_state FROM public.customer WHERE cognito_sub = $1`;

type Lookup = (sub: string) => Promise<CustomerRow | undefined>;

const lookupBySub: Lookup = async (sub) => (await query<CustomerRow>(CUSTOMER_BY_SUB, [sub])).rows[0];

/** `lookup` is a test seam. A database failure propagates to `shopperHandler` (503 for the connection limit, else 500). */
export async function resolveCustomer(
  event: AuthedEvent,
  scope: RequestScope,
  lookup: Lookup = lookupBySub,
): Promise<CustomerResolution> {
  const sub = subject(event);
  if (!sub) return { ok: false, response: unauthenticated(scope) };

  const row = await lookup(sub);
  // No row: the customer never completed sign-in on the customer service.
  if (!row) return { ok: false, response: unauthenticated(scope) };
  if (row.status === "barred" || row.closure_state === "closing") {
    return { ok: false, response: forbidden(scope) };
  }
  return { ok: true, customer: { id: row.id, sub } };
}
