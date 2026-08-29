/**
 * The entry gate and error mapping shared by every stock handler (054).
 *
 * ⚠ ONE FILE, TWO AUDIENCES. `shopGate` resolves the caller's OWN shop from `public.shop_staff`;
 * `backOfficeGate` takes the shop from the path and checks `admin.staff` instead. They produce the
 * same `Actor`, which is why the service beneath them is shared — see research R6. What must never
 * merge is the gating itself: the authorizers are per-route in `serverless.yml`, and the config
 * contract test fails if a shop route ever acquires the back-office one.
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
  // ⚠ Uniform, and it never says WHICH term failed. "Not a member", "inactive shop", "wrong role"
  // and "that shop is not yours" are one message, or the refusal becomes a discovery tool.
  return problem(403, ProblemType.Forbidden, "Not permitted",
    "this account is not permitted to perform that action", scope);
}

/** Shop gate — ANY active member of an active shop, either role (FR-010, A7). */
export async function shopGate(event: AuthedEvent, context: Context): Promise<GateOk | GateErr> {
  const scope = preamble(event, context);
  const sub = subject(event);
  if (!sub) return { ok: false, response: unauthenticated(scope) };
  try {
    const shopId = await authorizeShopMember(sub);
    if (!shopId) return { ok: false, response: forbidden(scope) };
    return { ok: true, actor: { sub, shopId, kind: "shop" }, scope };
  } catch (err) {
    // Fail-closed: a gate that cannot be evaluated is a refusal, never an implicit allow.
    scope.log.error({ err }, "inventory: shop gate failed");
    return { ok: false, response: unavailable(scope) };
  }
}

/**
 * Back-office gate — the shop comes from the PATH, and the tier decides what may be done.
 * Reading is open to any active staff including `csa` (triage is CSA work); writing is
 * admin/manager, because it changes another organisation's records on their behalf (FR-025/FR-028).
 */
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
    // ⚠ The permission check comes FIRST and the shop lookup second, so a refused caller learns
    // nothing about whether the shop they named exists.
    if (!allowed) return { ok: false, response: forbidden(scope) };
    if (!(await shopIsActive(shopId))) return { ok: false, response: forbidden(scope) };
    return { ok: true, actor: { sub, shopId, kind: "back_office" }, scope };
  } catch (err) {
    scope.log.error({ err }, "inventory: back-office gate failed");
    return { ok: false, response: unavailable(scope) };
  }
}

/** The platform's problem body carries field errors as a list, not a map. */
function toFieldErrors(fields?: Record<string, string>) {
  if (!fields) return undefined;
  return Object.entries(fields).map(([field, message]) => ({ field, message }));
}

/** Map a service refusal onto the platform's problem shape. */
export function mapStockError(
  err: unknown,
  scope: RequestScope,
): APIGatewayProxyStructuredResultV2 {
  if (err instanceof StockError) {
    switch (err.kind) {
      case "not_found":
        // ⚠ 403, NOT 404 — the same call `edge-api/shop`'s fulfilments service makes, for the same
        // reason (its FR/SC-007). Every read here is already shop-scoped, so "no such product" and
        // "another shop's product" are indistinguishable BY CONSTRUCTION; emitting a distinct 404
        // would hand a caller an oracle for enumerating other shops' catalogues by id. One code, one
        // body, no signal (FR-004).
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
