// Shared handler support for the shops slice: the back-office auth guard, ShopError → problem+json
// mapping, and domain → wire-DTO mappers. Keeps the 9 thin handlers free of repetition while each
// still owns its own parse/authorize/map flow (ARCHITECTURE: no middleware framework).
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import type { AuthedEvent, RequestScope } from "@effy/edge-shared";
import { forbidden, problem, ProblemType, subject, unavailable } from "@effy/edge-shared";
import type {
  AuditEntryDTO,
  PagedDTO,
  ShopDetailDTO,
  ShopListItemDTO,
  ShopUserDTO,
} from "@effy/shared-types";

import { canManageShops, isActiveStaff } from "./authz";
import { isShopError } from "./types";
import type { AuditEntry, Paged, ShopDetail, ShopListItem, ShopUser } from "./types";

const CONFLICT = "https://effyshopping.com/problems/conflict";
const NOT_FOUND = "https://effyshopping.com/problems/not-found";

/** Authenticate (401 if no sub) + authorize from the platform record (403), fail-closed to 503 on
 *  an infra error. `read` = any active staff; `mutate` = admin/manager (A1/FR-014). */
export async function guard(
  event: AuthedEvent,
  scope: RequestScope,
  level: "read" | "mutate",
): Promise<{ sub: string } | { deny: APIGatewayProxyStructuredResultV2 }> {
  const sub = subject(event);
  if (!sub) {
    return {
      deny: problem(401, ProblemType.Unauthenticated, "Authentication required",
        "a valid access token for this audience is required", scope),
    };
  }
  try {
    const ok = level === "read" ? await isActiveStaff(sub) : await canManageShops(sub);
    if (!ok) return { deny: forbidden(scope) };
  } catch (err) {
    scope.log.error(
      { err: err instanceof Error ? err.message : String(err), sub },
      "shop authz check failed",
    );
    return { deny: unavailable(scope) };
  }
  return { sub };
}

/** Map a domain error to problem+json. Unknown errors become 503 with the cause logged only. */
export function mapShopError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  if (isShopError(err)) {
    switch (err.kind) {
      case "validation":
        return problem(400, ProblemType.ValidationFailed, "Validation failed", err.message, scope, err.fields);
      case "not_found":
        return problem(404, NOT_FOUND, "Not found", err.message, scope);
      case "conflict":
        return problem(409, CONFLICT, "Conflict", err.message, scope);
    }
  }
  scope.log.error({ err: err instanceof Error ? err.message : String(err) }, "shop op failed");
  return unavailable(scope);
}

// ── domain → wire DTO (never leak domain shapes past the handler) ──────────────────────────────

export function toUserDTO(u: ShopUser): ShopUserDTO {
  return {
    id: u.id,
    subject: u.subject,
    email: u.email,
    name: u.name,
    roles: u.roles,
    status: u.status,
    lastSeenAt: u.lastSeenAt,
  };
}

export function toDetailDTO(d: ShopDetail): ShopDetailDTO {
  return {
    id: d.id,
    code: d.code,
    name: d.name,
    status: d.status,
    contactPhone: d.contactPhone,
    notes: d.notes,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    users: d.users.map(toUserDTO),
  };
}

export function toListDTO(p: Paged<ShopListItem>): PagedDTO<ShopListItemDTO> {
  return {
    items: p.items.map((i) => ({ id: i.id, code: i.code, name: i.name, status: i.status, userCount: i.userCount })),
    total: p.total,
    page: p.page,
    pageSize: p.pageSize,
  };
}

export function toAuditDTO(p: Paged<AuditEntry>): PagedDTO<AuditEntryDTO> {
  return {
    items: p.items.map((a) => ({
      id: a.id,
      actorSub: a.actorSub,
      action: a.action,
      targetType: a.targetType,
      targetId: a.targetId,
      detail: a.detail,
      createdAt: a.createdAt,
    })),
    total: p.total,
    page: p.page,
    pageSize: p.pageSize,
  };
}
