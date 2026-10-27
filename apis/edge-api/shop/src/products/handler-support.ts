import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import type { AuthedEvent, RequestScope } from "@effy/edge-shared";
import { forbidden, problem, ProblemType, stockState, subject, unavailable } from "@effy/edge-shared";
import type { ProductDetailDTO, ProductListDTO, ProductListItemDTO, ProductMediaDTO } from "@effy/shared-types";

import { authorizeShopMember } from "./authz";
import { isProductError } from "./types";
import type { Paged, ProductDetail, ProductListItem, ProductMedia } from "./types";

const CONFLICT = "https://effyshopping.com/problems/conflict";
const NOT_FOUND = "https://effyshopping.com/problems/not-found";

/** 401, 403 from the platform record (resolving the shop id), 503 on infra error. `shopId` scopes every query. */
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

/** Unknown errors become 503 with the cause logged only. */
export function mapProductError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  if (isProductError(err)) {
    switch (err.kind) {
      case "validation":
        return problem(400, ProblemType.ValidationFailed, "Validation failed", err.message, scope, err.fields);
      case "not_found":
        return problem(404, NOT_FOUND, "Not found", err.message, scope);
      case "conflict":
        return problem(409, CONFLICT, "Conflict", err.message, scope);
      case "forbidden":
        // Uniform: never says which term of the gate failed.
        return forbidden(scope);
    }
  }
  scope.log.error({ err: err instanceof Error ? err.message : String(err) }, "product op failed");
  return unavailable(scope);
}

export function toDetailDTO(d: ProductDetail): ProductDetailDTO {
  return {
    id: d.id,
    shopId: d.shopId,
    primaryCategoryId: d.primaryCategoryId,
    categoryName: d.categoryName,
    categoryPath: d.categoryPath,
    name: d.name,
    brand: d.brand,
    currency: d.currency,
    shortDescription: d.shortDescription,
    longDescription: d.longDescription,
    gstStatus: d.gstStatus,
    storage: d.storage,
    ageRestricted: d.ageRestricted,
    factDefaults: d.factDefaults,
    unitBasis: d.unitBasis,
    // Options and every variant, each with shop price, customer price and stock.
    options: d.options.map((o) => ({
      id: o.id, position: o.position, kind: o.kind, attributeId: o.attributeId, name: o.name,
      values: o.values.map((v) => ({ id: v.id, value: v.value, position: v.position, allowedValueId: v.allowedValueId })),
    })),
    variants: d.variants.map((v) => ({
      id: v.id,
      position: v.position,
      optionValueIds: v.optionValueIds,
      label: v.label,
      code: v.code,
      sku: v.sku,
      gtin: v.gtin,
      shopPriceAmount: v.shopPriceAmount,
      shopCompareAtAmount: v.shopCompareAtAmount,
      customerPriceAmount: v.priceAmount,
      customerCompareAtAmount: v.compareAtAmount,
      weightGrams: v.weightGrams,
      weightIsAssumed: v.weightIsAssumed,
      packQuantity: v.packQuantity,
      packUnit: v.packUnit,
      mediaId: v.mediaId,
      state: v.state,
      stock: stockState({
        productId: d.id, variantId: v.id, tracked: v.stockTracked, onHand: v.stockOnHand,
        threshold: v.lowStockThreshold, shopDefaultThreshold: d.shopDefaultThreshold,
      }),
    })),
    status: d.status,
    details: d.details,
    media: d.media.map((m) => ({
      id: m.id,
      url: m.url,
      storageKey: m.storageKey,
      isPrimary: m.isPrimary,
      displayOrder: m.displayOrder,
      altText: m.altText,
    })),
    sections: d.sections,
    missingRequired: d.missingRequired,
    ...(d.droppedDetails ? { droppedDetails: d.droppedDetails } : {}),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    // Review state.
    reviewState: d.reviewState,
    reviewReason: d.reviewReason,
    hold: d.hold,
    createdBy: d.createdBy,
    pendingChange: d.pendingChange
      ? {
          state: d.pendingChange.state,
          reason: d.pendingChange.reason,
          submittedAt: d.pendingChange.submittedAt,
          proposed: d.pendingChange.proposed,
          media: d.pendingChange.media ? d.pendingChange.media.map(toMediaDTO) : null,
        }
      : null,
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
        categoryName: i.categoryName,
        priceAmount: i.priceAmount,
        currency: i.currency,
        status: i.status,
        updatedAt: i.updatedAt,
        reviewState: i.reviewState,
        shopPriceAmount: i.priceAmount,
        customerPriceAmount: i.customerPriceAmount,
        priceVaries: i.priceVaries,
        variantCount: i.variantCount,
        missingRequired: i.missingRequired,
        hold: i.hold,
        createdBy: i.createdBy,
      }),
    ),
    total: p.total,
    page: p.page,
    pageSize: p.pageSize,
  };
}
