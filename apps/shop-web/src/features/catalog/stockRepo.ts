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

// The data layer for stock. Every call is scoped server-side to the operator's own shop
// there is no shopId in any path here, deliberately: the service resolves it from the caller's
// `shop_staff` record, so a client cannot reach another shop's stock by editing a URL.
//
// Note the path prefix. Stock lives at `/inventory/v1/*`, not `/shop/v1/*`, because it is served
// by a separate cold-path service (`apis/edge-api/inventory`). That split is not architectural taste
// — `edge-api/admin` is at 434 of CloudFormation's 500 resources, so the back-office half of this
// feature had nowhere to go, and putting both audiences in one new service keeps one stock service
// and repository instead of two that would drift. Same gateway, same api client, same
// bearer; only the prefix differs.

// Stock is counted per variant (a size); a product with one size has exactly one.
const base = (variantId: string) => `/inventory/v1/variants/${variantId}/stock`;

export function getVariantStock(variantId: string): Promise<ProductStockDetailDTO> {
  return api.get<ProductStockDetailDTO>(base(variantId));
}

export function setStockCount(
  variantId: string,
  body: SetStockRequest,
): Promise<ProductStockDetailDTO> {
  return api.put<ProductStockDetailDTO>(base(variantId), body);
}

export function adjustStock(
  variantId: string,
  body: AdjustStockRequest,
): Promise<ProductStockDetailDTO> {
  return api.post<ProductStockDetailDTO>(`${base(variantId)}/adjustments`, body);
}

export function setStockTracking(
  variantId: string,
  body: SetTrackingRequest,
): Promise<ProductStockDetailDTO> {
  return api.put<ProductStockDetailDTO>(`${base(variantId)}/tracking`, body);
}

export function setStockThreshold(
  variantId: string,
  body: SetThresholdRequest,
): Promise<ProductStockDetailDTO> {
  return api.put<ProductStockDetailDTO>(`${base(variantId)}/threshold`, body);
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
