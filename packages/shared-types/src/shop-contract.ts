/**
 * The shop-surface wire contract, as a single barrel + aggregator (014 D4s).
 *
 * So the KMP shop mobile app can generate its Kotlin DTOs from EXACTLY the types it consumes (the shop
 * identity/gate types from `shop.ts` + the RFC 9457 problem shape from `problem.ts`). `shop.ts` remains
 * the single source of truth (Principle II); this file only re-exports and aggregates, and it is the
 * input to `shop-contract:gen`.
 *
 * The `ShopContract` aggregator forces every referenced type into the schema under `--expose all`
 * (a bare `-t '*'` silently drops types). Do NOT add back-office shop-management DTOs here.
 */
import type {
  ShopRole,
  ShopStaffStatus,
  ShopLifecycleStatus,
  ShopSummaryDTO,
  ShopStaffRecordDTO,
  ShopManagerPingDTO,
} from "./shop";
import type { ProblemJSON } from "./problem";
import type {
  CatalogSchemaDTO,
  ProductListItemDTO,
  ProductListDTO,
  ProductDetailDTO,
  CreateProductRequest,
  UpdateProductRequest,
  ChangeProductStatusRequest,
  CreatePresignedUploadRequest,
  CreatePresignedUploadResponse,
  RegisterMediaRequest,
  UpdateMediaRequest,
  SetProductSectionsRequest,
  ShopSectionDTO,
  CreateShopSectionRequest,
  UpdateShopSectionRequest,
} from "./catalog";

export type {
  ShopRole,
  ShopStaffStatus,
  ShopLifecycleStatus,
  ShopSummaryDTO,
  ShopStaffRecordDTO,
  ShopManagerPingDTO,
  ProblemJSON,
  CatalogSchemaDTO,
  ProductListItemDTO,
  ProductListDTO,
  ProductDetailDTO,
  CreateProductRequest,
  UpdateProductRequest,
  ChangeProductStatusRequest,
  CreatePresignedUploadRequest,
  CreatePresignedUploadResponse,
  RegisterMediaRequest,
  UpdateMediaRequest,
  SetProductSectionsRequest,
  ShopSectionDTO,
  CreateShopSectionRequest,
  UpdateShopSectionRequest,
};

/** Aggregator — codegen entry only. Every field forces a type into the schema.
 *  The catalog block is the shop-facing subset (016) the mobile app consumes; admin-only
 *  schema-authoring request DTOs are deliberately NOT here. */
export interface ShopContract {
  role: ShopRole;
  staffStatus: ShopStaffStatus;
  lifecycleStatus: ShopLifecycleStatus;
  shopSummary: ShopSummaryDTO;
  staffRecord: ShopStaffRecordDTO;
  managerPing: ShopManagerPingDTO;
  problem: ProblemJSON;
  // ── 016 shop-facing catalog subset ──
  catalogSchema: CatalogSchemaDTO;
  productListItem: ProductListItemDTO;
  productList: ProductListDTO;
  productDetail: ProductDetailDTO;
  createProduct: CreateProductRequest;
  updateProduct: UpdateProductRequest;
  changeProductStatus: ChangeProductStatusRequest;
  createPresignedUpload: CreatePresignedUploadRequest;
  presignedUploadResponse: CreatePresignedUploadResponse;
  registerMedia: RegisterMediaRequest;
  updateMedia: UpdateMediaRequest;
  setProductSections: SetProductSectionsRequest;
  shopSection: ShopSectionDTO;
  createShopSection: CreateShopSectionRequest;
  updateShopSection: UpdateShopSectionRequest;
}
