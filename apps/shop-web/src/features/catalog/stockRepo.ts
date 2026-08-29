import type {
  AdjustStockRequest,
  LowStockRowDTO,
  ProductStockDetailDTO,
  SetShopStockSettingsRequest,
  SetStockRequest,
  SetThresholdRequest,
  SetTrackingRequest,
  ShopStockSettingsDTO,
} from "@effy/shared-types";

import { api } from "@/lib/api";

// The data layer for stock (054). Every call is scoped SERVER-SIDE to the operator's own shop —
// there is no shopId in any path here, deliberately: the service resolves it from the caller's
// `shop_staff` record, so a client cannot reach another shop's stock by editing a URL (FR-004).
//
// ⚠ NOTE THE PATH PREFIX. Stock lives at `/inventory/v1/*`, not `/shop/v1/*`, because it is served
// by a SEPARATE cold-path service (`apis/edge-api/inventory`). That split is not architectural taste
// — `edge-api/admin` is at 434 of CloudFormation's 500 resources, so the back-office half of this
// feature had nowhere to go, and putting both audiences in one new service keeps ONE stock service
// and repository instead of two that would drift (research R6). Same gateway, same api client, same
// bearer; only the prefix differs.

const base = (productId: string) => `/inventory/v1/products/${productId}/stock`;

export function getProductStock(productId: string): Promise<ProductStockDetailDTO> {
  return api.get<ProductStockDetailDTO>(base(productId));
}

export function setStockCount(
  productId: string,
  body: SetStockRequest,
): Promise<ProductStockDetailDTO> {
  return api.put<ProductStockDetailDTO>(base(productId), body);
}

export function adjustStock(
  productId: string,
  body: AdjustStockRequest,
): Promise<ProductStockDetailDTO> {
  return api.post<ProductStockDetailDTO>(`${base(productId)}/adjustments`, body);
}

export function setStockTracking(
  productId: string,
  body: SetTrackingRequest,
): Promise<ProductStockDetailDTO> {
  return api.put<ProductStockDetailDTO>(`${base(productId)}/tracking`, body);
}

export function setStockThreshold(
  productId: string,
  body: SetThresholdRequest,
): Promise<ProductStockDetailDTO> {
  return api.put<ProductStockDetailDTO>(`${base(productId)}/threshold`, body);
}

export function getLowStock(): Promise<LowStockRowDTO[]> {
  return api.get<LowStockRowDTO[]>("/inventory/v1/low-stock");
}

export function getStockSettings(): Promise<ShopStockSettingsDTO> {
  return api.get<ShopStockSettingsDTO>("/inventory/v1/settings");
}

export function setStockSettings(
  body: SetShopStockSettingsRequest,
): Promise<ShopStockSettingsDTO> {
  return api.put<ShopStockSettingsDTO>("/inventory/v1/settings", body);
}
