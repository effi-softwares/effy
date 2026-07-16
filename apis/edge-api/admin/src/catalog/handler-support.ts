// Shared handler support for the catalog slice (016): the back-office auth guard, CatalogError →
// problem+json mapping, and domain → wire-DTO mappers. Keeps the thin handlers free of repetition
// while each still owns its own parse/authorize/map flow (ARCHITECTURE: no middleware framework).
// Mirrors shops/handler-support.ts.
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import type { AuthedEvent, RequestScope } from "@effy/edge-shared";
import { forbidden, problem, ProblemType, subject, unavailable } from "@effy/edge-shared";
import type {
  AttributeAllowedValueDTO,
  AttributeDefinitionDTO,
  CategoryDTO,
  ProductTypeAttributeDTO,
  ProductTypeDTO,
} from "@effy/shared-types";

import { canManageCatalog, canReadCatalog } from "./authz";
import { isCatalogError } from "./types";
import type { AllowedValue, Assignment, AttributeDefinition, Category, ProductType } from "./types";

const CONFLICT = "https://effyshopping.com/problems/conflict";
const NOT_FOUND = "https://effyshopping.com/problems/not-found";

/** Authenticate (401 if no sub) + authorize from the platform record (403), fail-closed to 503 on
 *  an infra error. `read` = any active staff; `mutate` = admin/manager (R5). */
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
    const ok = level === "read" ? await canReadCatalog(sub) : await canManageCatalog(sub);
    if (!ok) return { deny: forbidden(scope) };
  } catch (err) {
    scope.log.error(
      { err: err instanceof Error ? err.message : String(err), sub },
      "catalog authz check failed",
    );
    return { deny: unavailable(scope) };
  }
  return { sub };
}

/** Map a domain error to problem+json. Unknown errors become 503 with the cause logged only. */
export function mapCatalogError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  if (isCatalogError(err)) {
    switch (err.kind) {
      case "validation":
        return problem(400, ProblemType.ValidationFailed, "Validation failed", err.message, scope, err.fields);
      case "not_found":
        return problem(404, NOT_FOUND, "Not found", err.message, scope);
      case "conflict":
        return problem(409, CONFLICT, "Conflict", err.message, scope);
    }
  }
  scope.log.error({ err: err instanceof Error ? err.message : String(err) }, "catalog op failed");
  return unavailable(scope);
}

// ── domain → wire DTO (never leak domain shapes past the handler) ──────────────────────────────

function toAllowedDTO(a: AllowedValue): AttributeAllowedValueDTO {
  return { id: a.id, value: a.value, label: a.label, displayOrder: a.displayOrder };
}

function toAssignmentDTO(a: Assignment): ProductTypeAttributeDTO {
  return {
    attributeId: a.attributeId,
    key: a.key,
    name: a.name,
    dataType: a.dataType,
    unit: a.unit,
    helpText: a.helpText,
    validation: a.validation,
    allowedValues: a.allowedValues.map(toAllowedDTO),
    isMandatory: a.isMandatory,
    displayOrder: a.displayOrder,
    groupLabel: a.groupLabel,
  };
}

export function toProductTypeDTO(t: ProductType): ProductTypeDTO {
  return {
    id: t.id,
    key: t.key,
    name: t.name,
    description: t.description,
    status: t.status,
    attributes: t.attributes.map(toAssignmentDTO),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export function toAttributeDTO(a: AttributeDefinition): AttributeDefinitionDTO {
  return {
    id: a.id,
    key: a.key,
    name: a.name,
    dataType: a.dataType,
    unit: a.unit,
    helpText: a.helpText,
    validation: a.validation,
    status: a.status,
    allowedValues: a.allowedValues.map(toAllowedDTO),
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

export function toCategoryDTO(c: Category): CategoryDTO {
  return {
    id: c.id,
    parentId: c.parentId,
    key: c.key,
    name: c.name,
    displayOrder: c.displayOrder,
    status: c.status,
  };
}
