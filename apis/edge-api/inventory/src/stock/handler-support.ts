/**
 * `shopGate` resolves the caller's own shop; `backOfficeGate` takes it from the path and checks
 * `admin.staff`. Both produce the same `Actor`, so the service beneath is shared.
 */

import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent, RequestScope } from "@effy/edge-shared";
import {
  hasStaffRole,
  isActiveStaff,
  OUTWARD_ACTION_ROLES,
  preamble,
  problem,
  ProblemType,
  subject,
  unavailable,
} from "@effy/edge-shared";

import { authorizeShopMember, shopIsActive } from "./authz";
import { StockError, type Actor } from "./types";

export interface GateOk {
  ok: true;
  actor: Actor;
  scope: RequestScope;
}
export interface GateErr {
  ok: false;
  response: APIGatewayProxyStructuredResultV2;
}

function unauthenticated(scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  return problem(401, ProblemType.Unauthenticated, "Authentication required",
    "a valid access token for this audience is required", scope);
}

function forbidden(scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  // One message for every failed term, or the refusal becomes a discovery tool.
  return problem(403, ProblemType.Forbidden, "Not permitted",
    "this account is not permitted to perform that action", scope);
}

/** Any active member of an active shop, either role. */
export async function shopGate(event: AuthedEvent, context: Context): Promise<GateOk | GateErr> {
  const scope = preamble(event, context);
  const sub = subject(event);
  if (!sub) return { ok: false, response: unauthenticated(scope) };
  try {
    const shopId = await authorizeShopMember(sub);
    if (!shopId) return { ok: false, response: forbidden(scope) };
    return { ok: true, actor: { sub, shopId, kind: "shop" }, scope };
  } catch (err) {
    scope.log.error({ err }, "inventory: shop gate failed");
    return { ok: false, response: unavailable(scope) };
  }
}

/** The shop comes from the path. Reads: any active staff; writes: admin/manager. */
export async function backOfficeGate(
  event: AuthedEvent,
  context: Context,
  mode: "read" | "write",
): Promise<GateOk | GateErr> {
  const scope = preamble(event, context);
  const sub = subject(event);
  if (!sub) return { ok: false, response: unauthenticated(scope) };
  const shopId = event.pathParameters?.shopId;
  if (!shopId) return { ok: false, response: forbidden(scope) };
  try {
    const allowed =
      mode === "read" ? await isActiveStaff(sub) : await hasStaffRole(sub, OUTWARD_ACTION_ROLES);
    // Permission before the shop lookup, so a refused caller learns nothing about the shop.
    if (!allowed) return { ok: false, response: forbidden(scope) };
    if (!(await shopIsActive(shopId))) return { ok: false, response: forbidden(scope) };
    return { ok: true, actor: { sub, shopId, kind: "back_office" }, scope };
  } catch (err) {
    scope.log.error({ err }, "inventory: back-office gate failed");
    return { ok: false, response: unavailable(scope) };
  }
}

function toFieldErrors(fields?: Record<string, string>) {
  if (!fields) return undefined;
  return Object.entries(fields).map(([field, message]) => ({ field, message }));
}

export function mapStockError(
  err: unknown,
  scope: RequestScope,
): APIGatewayProxyStructuredResultV2 {
  if (err instanceof StockError) {
    switch (err.kind) {
      case "not_found":
        // 403, not 404: every read is shop-scoped, so "no such product" and "another shop's" must match.
        return forbidden(scope);
      case "validation":
        return problem(400, ProblemType.ValidationFailed, "Validation failed", err.message, scope,
          toFieldErrors(err.fields));
      case "conflict":
        return problem(409, ProblemType.Conflict, "Conflict", err.message, scope);
    }
  }
  scope.log.error({ err }, "inventory: unhandled stock error");
  return unavailable(scope);
}
