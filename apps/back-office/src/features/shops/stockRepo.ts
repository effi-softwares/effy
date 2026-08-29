import type {
  LowStockRowDTO,
  ProductStockDetailDTO,
  SetShopStockSettingsRequest,
  SetStockRequest,
  SetTrackingRequest,
} from "@effy/shared-types";

import { api } from "@/lib/api";

// The data layer for the ASSISTED stock path (054 US4) — back-office acting on a shop's behalf.
//
// ⚠ THE SHOP IS IN THE PATH HERE, unlike the shop's own console where it is resolved server-side
// from the caller's `shop_staff` record and never read from input. That difference is the whole
// shape of this feature: a shop can only ever reach its own stock; back-office reaches any shop's,
// and every write it makes is attributed to the individual and marked as back-office so the shop can
// see plainly who changed their numbers (FR-027).
//
// Served by `edge-api/inventory`, not `edge-api/admin` — the admin stack is at 434 of
// CloudFormation's 500 resources and had no room (research R6). Same gateway, same bearer.

const base = (shopId: string) => `/inventory/v1/admin/shops/${shopId}`;

export function getShopProductStock(
  shopId: string,
  productId: string,
): Promise<ProductStockDetailDTO> {
  return api.get<ProductStockDetailDTO>(`${base(shopId)}/products/${productId}/stock`);
}

export function getShopLowStock(shopId: string): Promise<LowStockRowDTO[]> {
  return api.get<LowStockRowDTO[]>(`${base(shopId)}/low-stock`);
}

export function setShopProductStock(
  shopId: string,
  productId: string,
  body: SetStockRequest,
): Promise<ProductStockDetailDTO> {
  return api.put<ProductStockDetailDTO>(`${base(shopId)}/products/${productId}/stock`, body);
}

export function setShopProductTracking(
  shopId: string,
  productId: string,
  body: SetTrackingRequest,
): Promise<ProductStockDetailDTO> {
  return api.put<ProductStockDetailDTO>(
    `${base(shopId)}/products/${productId}/stock/tracking`,
    body,
  );
}

export function setShopStockSettings(
  shopId: string,
  body: SetShopStockSettingsRequest,
): Promise<{ defaultThreshold: number | null }> {
  return api.put(`${base(shopId)}/settings`, body);
}
