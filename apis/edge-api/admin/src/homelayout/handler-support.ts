// Shared handler support for the home layout slice: the back-office guard, LayoutError → problem+json,
// and domain → wire-DTO mappers. Mirrors the promotions slice — each thin handler still owns its own
// parse/authorize/map flow (ARCHITECTURE: no middleware framework).
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import type { AuthedEvent, RequestScope } from "@effy/edge-shared";
import { forbidden, problem, ProblemType, subject, unavailable } from "@effy/edge-shared";
import type { HomeLayoutDTO } from "@effy/shared-types";

import { canComposeHome, isActiveStaff } from "./authz";
import type { AuditEntry } from "./repository";
import { type HomeLayout, LayoutError, isLayoutError } from "./types";

/**
 * Authenticate (401) + authorize from the platform record (403), fail-closed to 503 on an infra error.
 * `read` = any active staff including csa — seeing what the storefront says is support work, and it
 * discloses nothing a shopper cannot already see. `mutate` = admin/manager only (FR-016).
 */
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
    const ok = level === "read" ? await isActiveStaff(sub) : await canComposeHome(sub);
    if (!ok) return { deny: forbidden(scope) };
  } catch (err) {
    scope.log.error({ err: err instanceof Error ? err.message : String(err), sub }, "home layout authz check failed");
    return { deny: unavailable(scope) };
  }
  return { sub };
}

/**
 * Map a domain refusal to problem+json.
 *
 * ⚠ The per-block issues travel in `fields`, because "this layout is invalid" is not something an
 * operator can act on. The composer needs to know WHICH block and WHICH field, so it can put the
 * message where the problem is rather than in a banner at the top of a page of twenty blocks.
 */
export function mapLayoutError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  if (isLayoutError(err)) {
    return problem(
      err.status,
      `https://effyshopping.com/problems/${err.code.replace(/_/g, "-")}`,
      err.status === 409 ? "Conflict" : err.status === 503 ? "Unavailable" : "Validation failed",
      err.message,
      scope,
      err.issues.length > 0
        ? err.issues.map((i) => ({ field: i.blockId + (i.field ? `.${i.field}` : ""), code: i.code, message: i.message }))
        : undefined,
    );
  }
  scope.log.error({ err: err instanceof Error ? err.message : String(err) }, "home layout op failed");
  return unavailable(scope);
}

export function toLayoutDTO(l: HomeLayout): HomeLayoutDTO {
  return {
    draft: l.draft,
    published: l.published,
    revision: l.revision,
    publishedAt: l.publishedAt,
    publishedBy: l.publishedBy,
    updatedAt: l.updatedAt,
    updatedBy: l.updatedBy,
  };
}

export function toAuditDTO(a: AuditEntry): {
  id: string;
  actorSub: string;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
} {
  return { id: a.id, actorSub: a.actorSub, action: a.action, detail: a.detail, createdAt: a.createdAt };
}

/**
 * The revision a mutating request is conditional on (FR-017).
 *
 * ⚠ A MISSING REVISION IS REFUSED, never defaulted. Defaulting to "whatever is current" would turn
 * every client that forgets the field into one that silently overwrites concurrent work — which is
 * the exact failure optimistic concurrency exists to prevent, reintroduced by a convenience.
 */
export function requireRevision(body: unknown): number {
  const raw = (body as { revision?: unknown })?.revision;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {
    throw new LayoutError(400, "revision_required", "every write must carry the revision it was based on");
  }
  return raw;
}
