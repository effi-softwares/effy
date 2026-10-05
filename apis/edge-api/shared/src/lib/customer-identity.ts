/**
 * Verified subject → platform customer, for every signed-in route of a shopper-facing service.
 *
 * The gateway authenticates the token; `public.customer` decides access (Principle IV). A `barred`
 * customer is refused whatever their token says, and so is one whose account is closing (034
 * FR-041) — closure enforced only on the account screens would leave a "deleted" customer able to
 * fill a cart and place an order.
 *
 * ⚠ CALLED ON EVERY REQUEST, NEVER CACHED. A ban or a closure must take effect on the next request,
 * not when a container happens to be recycled.
 *
 * ⚠ The two 403s are INDISTINGUISHABLE on the wire, and a missing record is the same 401 as any
 * other sign-in failure: the response discloses nothing about which condition applied.
 */
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import { subject, type AuthedEvent } from "./claims";
import { query } from "./db";
import { forbidden, unauthenticated, type RequestScope } from "./http";

export interface ResolvedCustomer {
  /** `public.customer.id` — what every commerce query is scoped by. */
  id: string;
  /** The verified Cognito subject. */
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

/** Exported for the container test, which runs this exact statement against the real schema. */
export const CUSTOMER_BY_SUB = `SELECT id::text AS id, status, closure_state FROM public.customer WHERE cognito_sub = $1`;

type Lookup = (sub: string) => Promise<CustomerRow | undefined>;

const lookupBySub: Lookup = async (sub) => (await query<CustomerRow>(CUSTOMER_BY_SUB, [sub])).rows[0];

/**
 * `lookup` is a seam for tests only. A database failure is NOT caught here: it propagates to
 * `shopperHandler`, which answers the connection limit as a 503 and anything else as a 500.
 */
export async function resolveCustomer(
  event: AuthedEvent,
  scope: RequestScope,
  lookup: Lookup = lookupBySub,
): Promise<CustomerResolution> {
  const sub = subject(event);
  if (!sub) return { ok: false, response: unauthenticated(scope) };

  const row = await lookup(sub);
  // No row: the customer never completed the sign-in bootstrap on the customer service.
  if (!row) return { ok: false, response: unauthenticated(scope) };
  if (row.status === "barred" || row.closure_state === "closing") {
    return { ok: false, response: forbidden(scope) };
  }
  return { ok: true, customer: { id: row.id, sub } };
}
