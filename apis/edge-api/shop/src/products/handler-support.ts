// Shared handler support for the shop products slice (016): the shop-member auth gate (resolving
// the actor's shop id), ProductError → problem+json mapping, and domain → wire-DTO mappers. Keeps
// the thin handlers free of repetition while each owns its own parse/authorize/map flow
// (ARCHITECTURE: no middleware framework).
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import type { AuthedEvent, RequestScope } from "@effy/edge-shared";
import { forbidden, problem, ProblemType, subject, unavailable } from "@effy/edge-shared";
import type {
  CatalogSchemaDTO,
  CategoryDTO,
  ProductDetailDTO,
  ProductListDTO,
  ProductListItemDTO,
  ProductMediaDTO,
  ProductTypeAttributeDTO,
  ProductTypeDTO,
} from "@effy/shared-types";

import { authorizeShopMember } from "./authz";
import { isProductError } from "./types";
import type {
  CatalogSchema,
  Paged,
  ProductDetail,
  ProductListItem,
  ProductMedia,
  SchemaAttribute,
  SchemaProductType,
} from "./types";

const CONFLICT = "https://effyshopping.com/problems/conflict";
const NOT_FOUND = "https://effyshopping.com/problems/not-found";

/**
 * Authenticate (401 if no sub) + authorize from the platform record, resolving the actor's active
 * shop id in the same step (403 on deny). Fail-closed to 503 on an infra error. The returned
 * `shopId` scopes every downstream query — it is never taken from client input (FR-019/FR-031).
 */
export async function gate(
  event: AuthedEvent,
  scope: RequestScope,
): Promise<{ sub: string; shopId: string } | { deny: APIGatewayProxyStructuredResultV2 }> {
  const sub = subject(event);
  if (!sub) {
    return {
      deny: problem(401, ProblemType.Unauthenticated, "Authentication required",
        "a valid access token for this audience is required", scope),
    };
  }
  try {
    const shopId = await authorizeShopMember(sub);
    if (!shopId) return { deny: forbidden(scope) };
    return { sub, shopId };
  } catch (err) {
    scope.log.error(
      { err: err instanceof Error ? err.message : String(err), sub },
      "shop-member authz check failed",
    );
    return { deny: unavailable(scope) };
  }
}

/** Map a domain error to problem+json. Unknown errors become 503 with the cause logged only. */
export function mapProductError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  if (isProductError(err)) {
    switch (err.kind) {
      case "validation":
        return problem(400, ProblemType.ValidationFailed, "Validation failed", err.message, scope, err.fields);
      case "not_found":
        return problem(404, NOT_FOUND, "Not found", err.message, scope);
      case "conflict":
        return problem(409, CONFLICT, "Conflict", err.message, scope);
    }
  }
  scope.log.error({ err: err instanceof Error ? err.message : String(err) }, "product op failed");
  return unavailable(scope);
}

// ── domain → wire DTO (never leak domain shapes past the handler) ──────────────────────────────

function toAssignmentDTO(a: SchemaAttribute): ProductTypeAttributeDTO {
  return {
    attributeId: a.attributeId,
    key: a.key,
    name: a.name,
    dataType: a.dataType,
    unit: a.unit,
    helpText: a.helpText,
    validation: a.validation,
    allowedValues: a.allowedValues.map((v) => ({ id: v.id, value: v.value, label: v.label, displayOrder: v.displayOrder })),
    isMandatory: a.isMandatory,
    displayOrder: a.displayOrder,
    groupLabel: a.groupLabel,
  };
}

function toSchemaTypeDTO(t: SchemaProductType): ProductTypeDTO {
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

export function toCatalogSchemaDTO(s: CatalogSchema): CatalogSchemaDTO {
  return {
    productTypes: s.productTypes.map(toSchemaTypeDTO),
    categories: s.categories.map(
      (c): CategoryDTO => ({
        id: c.id,
        parentId: c.parentId,
        key: c.key,
        name: c.name,
        displayOrder: c.displayOrder,
        status: c.status,
      }),
    ),
  };
}

export function toDetailDTO(d: ProductDetail): ProductDetailDTO {
  return {
    id: d.id,
    shopId: d.shopId,
    productTypeId: d.productTypeId,
    typeName: d.typeName,
    primaryCategoryId: d.primaryCategoryId,
    categoryName: d.categoryName,
    name: d.name,
    sku: d.sku,
    gtin: d.gtin,
    brand: d.brand,
    priceAmount: d.priceAmount,
    currency: d.currency,
    compareAtAmount: d.compareAtAmount,
    shortDescription: d.shortDescription,
    longDescription: d.longDescription,
    status: d.status,
    attributes: d.attributes.map((a) => ({
      attributeId: a.attributeId,
      key: a.key,
      name: a.name,
      dataType: a.dataType,
      unit: a.unit,
      valueText: a.valueText,
      valueNumber: a.valueNumber,
      valueBoolean: a.valueBoolean,
      valueOptions: a.valueOptions,
    })),
    media: d.media.map((m) => ({
      id: m.id,
      url: m.url,
      storageKey: m.storageKey,
      isPrimary: m.isPrimary,
      displayOrder: m.displayOrder,
      altText: m.altText,
    })),
    sections: d.sections,
    missingMandatoryAttributes: d.missingMandatoryAttributes,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export function toSectionDTO(s: { id: string; name: string; displayOrder: number }): import("@effy/shared-types").ShopSectionDTO {
  return { id: s.id, name: s.name, displayOrder: s.displayOrder };
}

export function toMediaDTO(m: ProductMedia): ProductMediaDTO {
  return {
    id: m.id,
    url: m.url,
    storageKey: m.storageKey,
    isPrimary: m.isPrimary,
    displayOrder: m.displayOrder,
    altText: m.altText,
  };
}

export function toListDTO(p: Paged<ProductListItem>): ProductListDTO {
  return {
    items: p.items.map(
      (i): ProductListItemDTO => ({
        id: i.id,
        name: i.name,
        brand: i.brand,
        primaryImageUrl: i.primaryImageUrl,
        typeName: i.typeName,
        categoryName: i.categoryName,
        priceAmount: i.priceAmount,
        currency: i.currency,
        status: i.status,
        sku: i.sku,
        updatedAt: i.updatedAt,
      }),
    ),
    total: p.total,
    page: p.page,
    pageSize: p.pageSize,
  };
}
