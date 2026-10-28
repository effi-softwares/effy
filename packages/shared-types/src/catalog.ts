import type { ListPage } from "./list";
/**
 * Shop-facing product contracts (products, media, sections), served by the shop service. The taxonomy —
 * categories, the attribute library and each leaf's form — is in taxonomy.ts (101). Enum unions mirror the
 * SQL check sets.
 */
import type { GstStatus } from "./documents";
import type { FactKey } from "./product-form";
import type { DetailInput, FactDefaults, Storage } from "./taxonomy";
import type { UnitBasis } from "./unit-price";
import type { OptionDTO, OptionInputDTO, ShopVariantDTO, VariantInputDTO } from "./variants";


// Enums (mirror the SQL check sets)

/** Product lifecycle: `draft` → `active` (publish) ↔ `unavailable`; any → `archived` (soft remove). */
export type ProductStatus = "draft" | "active" | "unavailable" | "archived";
export const PRODUCT_STATUSES: readonly ProductStatus[] = [
  "draft",
  "active",
  "unavailable",
  "archived",
];

/** A row in the shop catalog table (server-paginated). */
export interface ProductListItemDTO {
  id: string;
  name: string;
  brand: string | null;
  primaryImageUrl: string | null;
  /** The home leaf's name. */
  categoryName: string;
  /** The lowest shop price among active variants (say "From" when `priceVaries`); equals `shopPriceAmount`. */
  priceAmount: string;
  currency: string;
  status: ProductStatus;
  updatedAt: string;
  /** Where the product stands with Effy's review. */
  reviewState?: ShopReviewState;
  /** Effy's hold, or null (102). */
  hold: ProductHoldShownDTO | null;
  /** Who made the product: the shop, or Effy for the shop (102). */
  createdBy: "shop" | "effy";
  /** The lowest shop price among active variants. */
  shopPriceAmount?: string;
  /** The lowest customer price among active variants; null until first approved. */
  customerPriceAmount?: string | null;
  /** Active variants' prices differ. */
  priceVaries: boolean;
  /** Variants that are not removed. */
  variantCount: number;
  /** Required details still empty (staff may have added a requirement after approval). */
  missingRequired: number;
}

/** A media object on a product (lists and detail carry short-lived presigned GET URLs). */
export interface ProductMediaDTO {
  id: string;
  url: string;
  storageKey: string;
  isPrimary: boolean;
  displayOrder: number;
  altText: string | null;
}

/** Full product detail. `updatedAt` is the optimistic-concurrency token. */
export interface ProductDetailDTO {
  id: string;
  shopId: string;
  /** The home leaf. */
  primaryCategoryId: string;
  categoryName: string;
  /** Names from the department to the home leaf. */
  categoryPath: string[];
  name: string;
  brand: string | null;
  currency: string;
  shortDescription: string;
  longDescription: string | null;
  gstStatus: GstStatus;
  /** How it is kept; decides cold-chain handling. */
  storage: Storage;
  /** Sold to adults only (labelled 18+ to customers). */
  ageRestricted: boolean;
  /** The home leaf's defaults for the three facts, so the form can say "from category". */
  factDefaults: FactDefaults;
  /** How this product's sizes are compared (unit pricing); null = no unit price. */
  unitBasis: UnitBasis | null;
  /** Up to two options ("Size", "Flavour") with their values in the shop's order; empty with no options. */
  options: OptionDTO[];
  /**
   * Every variant (active, inactive, then removed), in display order. Price, codes, weight, pack size
   * and stock live here; a product has none of its own.
   */
  variants: ShopVariantDTO[];
  status: ProductStatus;
  /** Values for the leaf's form, for the whole product or per variant. */
  details: DetailInput[];
  media: ProductMediaDTO[];
  sections: string[];
  /** Required details still empty ("Allergens", "Allergens (Mango)"); submission is refused while any are. */
  missingRequired: string[];
  /** On the response to a save only: details that no longer had a place (a new category, one variant left). */
  droppedDetails?: string[];
  createdAt: string;
  updatedAt: string;

  // Review. Nothing here names or derives from Effy's margin: a shop sees what it is paid and what the
  // customer pays.
  reviewState?: ShopReviewState;
  /** Effy's hold, or null (102). The shop cannot put a held product on sale. */
  hold: ProductHoldShownDTO | null;
  /** Who made the product: the shop, or Effy for the shop (102). */
  createdBy: "shop" | "effy";
  /** Why Effy last sent this product (or its pending change) back. Carries no staff identity. */
  reviewReason?: string | null;
  /** The shop's proposed new version of an approved product, or null. Customers see the fields above until it is approved. */
  pendingChange?: ProductPendingChangeDTO | null;
}

/**
 * Where a product stands with Effy's review, from two facts: whether it was ever approved, and whether
 * something is waiting. "live" means approved; whether it is on sale is `status`.
 */
export type ShopReviewState =
  | "draft"
  | "in_review"
  | "sent_back"
  | "live"
  | "live_change_pending"
  | "live_change_sent_back"
  // Effy created it and is still finishing it (102): read-only to the shop until it goes on sale.
  | "effy_setup";

/** Effy holding a product off sale (102): shown to the shop as from Effy, never a person. */
export interface ProductHoldShownDTO {
  reason: string;
  heldAt: string;
}

/** What a pending change proposes: only the details that differ from the live product. */
export interface ProductChangeProposalDTO {
  name?: string;
  shortDescription?: string;
  longDescription?: string | null;
  brand?: string | null;
  primaryCategoryId?: string;
  gstStatus?: GstStatus;
  storage?: Storage;
  ageRestricted?: boolean;
  /** The complete proposed details, only when they differ from live. */
  details?: DetailInput[];
  unitBasis?: UnitBasis | null;
  /** The complete proposed option set, only when it differs from live. */
  options?: OptionInputDTO[];
  /** The complete proposed variant set (shop prices), only when it differs; a live variant missing from it is removed on approval. */
  variants?: VariantInputDTO[];
}

export interface ProductPendingChangeDTO {
  state: "in_review" | "sent_back";
  reason: string | null;
  submittedAt: string;
  proposed: ProductChangeProposalDTO;
  /** The complete proposed image set, or null when unchanged. */
  media: ProductMediaDTO[] | null;
}

/** POST /shop/v1/products: create a shop-owned product. */
export interface CreateProductRequest {
  /** Must be an active leaf. */
  primaryCategoryId: string;
  name: string;
  brand?: string | null;
  shortDescription: string;
  longDescription?: string | null;
  /** Omitted facts take the leaf's defaults; refused when the leaf has none (`fact_required`). */
  gstStatus?: GstStatus;
  storage?: Storage;
  ageRestricted?: boolean;
  /** How sizes are compared; omit for no unit price. */
  unitBasis?: UnitBasis | null;
  /** 0 to 2 options. Ids are client-generated UUIDs. */
  options: OptionInputDTO[];
  /**
   * 1 to 50 variants; exactly one (with no option values) when there are no options. Each has its own
   * price, codes and shipping weight (omit a weight to record the platform default as an assumption).
   */
  variants: VariantInputDTO[];
  details?: DetailInput[];
  sectionIds?: string[];
  primaryMediaStorageKey?: string | null;
  media?: { storageKey: string; isPrimary?: boolean; altText?: string | null; displayOrder?: number }[];
}

/** PATCH /shop/v1/products/{id}: a focused edit of any subset of content fields. `expectedUpdatedAt`
 *  is required (a stale value is 409). */
export interface UpdateProductRequest {
  expectedUpdatedAt: string;
  name?: string;
  /** A draft moving leaf drops details the new leaf does not ask for; facts not in `factsTouched` re-default. */
  primaryCategoryId?: string;
  factsTouched?: FactKey[];
  brand?: string | null;
  shortDescription?: string;
  longDescription?: string | null;
  /** On a live product these are proposed and reviewed, like every other detail. */
  gstStatus?: GstStatus;
  storage?: Storage;
  ageRestricted?: boolean;
  /** The complete set of details when present. */
  details?: DetailInput[];
  unitBasis?: UnitBasis | null;
  /**
   * When present, both are the complete target sets, sent together: written as-is on a draft, part of the
   * pending change on a live product. Variant state has its own immediate route.
   */
  options?: OptionInputDTO[];
  variants?: VariantInputDTO[];
}

/** POST /shop/v1/products/{id}/status: a lifecycle transition. */
export interface ChangeProductStatusRequest {
  status: ProductStatus;
}

/** POST /shop/v1/products/{id}/media: request a presigned direct-to-S3 upload. */
export interface CreatePresignedUploadRequest {
  contentType: string;
  fileSize: number;
}

export interface CreatePresignedUploadResponse {
  uploadUrl: string;
  storageKey: string;
}

/** POST /shop/v1/products/{id}/media/register: record an uploaded object. */
export interface RegisterMediaRequest {
  storageKey: string;
  isPrimary?: boolean;
  altText?: string | null;
  displayOrder?: number;
}

/** PATCH /shop/v1/products/{id}/media/{mediaId}: reorder, set primary, alt text. */
export interface UpdateMediaRequest {
  isPrimary?: boolean;
  displayOrder?: number;
  altText?: string | null;
}

/** PATCH /shop/v1/products/{id}/sections: set a product's section membership. */
export interface SetProductSectionsRequest {
  sectionIds: string[];
}

/** A shop-local menu section. */
export interface ShopSectionDTO {
  id: string;
  name: string;
  displayOrder: number;
}

export interface CreateShopSectionRequest {
  name: string;
  displayOrder?: number;
}

export interface UpdateShopSectionRequest {
  name?: string;
  displayOrder?: number;
}

/** Paged product list, declared concretely (not a generic alias) so the Kotlin generator can name it. */
/** The shop's catalogue as a console list page (103). */
export type ProductListDTO = ListPage<ProductListItemDTO>;
