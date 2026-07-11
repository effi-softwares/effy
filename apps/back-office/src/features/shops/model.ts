import type {
  AuditEntryDTO,
  ChangeShopStatusRequest,
  CreateShopRequest,
  CreateShopUserRequest,
  PagedDTO,
  ShopDetailDTO,
  ShopListItemDTO,
  ShopUserDTO,
  UpdateShopRequest,
  UpdateShopUserRequest,
} from "@effy/shared-types";

/**
 * Domain shapes for back-office shop management (009).
 *
 * The wire DTOs (specs/009 contracts, already written in @effy/shared-types) are the domain shapes
 * here — they carry no wire-only encoding to strip. We still route every read/write through the
 * repo layer (Principle VI), so if a DTO and its domain model ever diverge, only the repo changes.
 */
export type ShopListItem = ShopListItemDTO;
export type ShopDetail = ShopDetailDTO;
export type ShopUser = ShopUserDTO;
export type AuditEntry = AuditEntryDTO;
export type Paged<T> = PagedDTO<T>;

export type {
  ChangeShopStatusRequest,
  CreateShopRequest,
  CreateShopUserRequest,
  UpdateShopRequest,
  UpdateShopUserRequest,
};

/** Query params for the shop register (server-side pagination + filter + search). */
export interface ShopListParams {
  page: number;
  pageSize: number;
  status?: import("@effy/shared-types").ShopLifecycleStatus;
  q?: string;
}
