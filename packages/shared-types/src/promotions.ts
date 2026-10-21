import type { AuditEntryDTO, PagedDTO } from "./shop";
import type { BannerTarget } from "./storefront";
import type { DesignedLayout, GroupSize, SkinLayout, SkinSettings } from "./promotion-skins";

/**
 * Promotions (094) — the model that replaced 027's one-code promotion.
 *
 * A promotion is an OFFER of one of four kinds, applied automatically or by a code, limited by who,
 * when and how much, and shown in display groups the customer clients ask for by key. Its state is
 * never stored: the database works it out (`public.promotion_state`) from its switch, dates, uses
 * and budget, and every reader asks for it.
 *
 * ⚠ ONE EVALUATOR: `@effy/edge-shared/promotions` (engine.ts). Nothing else computes a discount.
 */

export type PromotionKind = "cart" | "item" | "bxgy" | "delivery";
export const PROMOTION_KINDS: readonly PromotionKind[] = ["cart", "item", "bxgy", "delivery"];

export type PromotionTrigger = "automatic" | "code";
export const PROMOTION_TRIGGERS: readonly PromotionTrigger[] = ["automatic", "code"];

export type PromotionValueType = "percent" | "amount" | "free";

export type PromotionAppliesTo = "cart" | "products" | "categories" | "brands";

export type PromotionAudience = "everyone" | "first_order" | "new_customers" | "chosen";
export const PROMOTION_AUDIENCES: readonly PromotionAudience[] = ["everyone", "first_order", "new_customers", "chosen"];

export type PromotionDeliveryType = "effy" | "courier";

export type PromotionState = "draft" | "scheduled" | "active" | "paused" | "used_up" | "out_of_budget" | "ended" | "archived";
export const PROMOTION_STATES: readonly PromotionState[] = [
  "draft",
  "scheduled",
  "active",
  "paused",
  "used_up",
  "out_of_budget",
  "ended",
  "archived",
];

export type PromotionAction = "publish" | "pause" | "resume" | "end" | "archive";
export const PROMOTION_ACTIONS: readonly PromotionAction[] = ["publish", "pause", "resume", "end", "archive"];

// ── What a shopper is shown ─────────────────────────────────────────────────────────────────────

/** One promotion as both customer clients show it, from either group read. */
export interface ShopperPromotionDTO {
  id: string;
  kind: PromotionKind;
  headline: string;
  supportingLine: string | null;
  label: string | null;
  /** The shared code; null for an automatic promotion or one with single-use codes only (FR-032). */
  code: string | null;
  /** The one conditions sentence, composed server-side ("On orders over $30.00 · Effy delivery only"). */
  terms: string | null;
  /** "Ends in 3 days" / "Ends tomorrow" / "Ends today" / null. */
  endsIn: string | null;
  /** Where a tap goes. */
  target: BannerTarget;
  /**
   * 095 — how this promotion looks in THIS place (resolved per group member). Absent from servers before
   * 095; a client that does not know `skin.layout` draws its built-in look, as for `classic`.
   */
  skin?: ShopperSkinDTO;
}

/** 095 — the skin a placement wears, with the picture it shows. */
export interface ShopperSkinDTO {
  id: string;
  version: number;
  layout: SkinLayout;
  /** The size of the place the group fills. */
  size: GroupSize;
  /** Absent for `classic`. */
  settings?: SkinSettings;
  picture?: ShopperSkinPictureDTO;
}

export interface ShopperSkinPictureDTO {
  url: string;
  /** 086 — widths of the WebP copies; derive each with `renditionUrl`. */
  imageWidths?: number[];
  width: number;
  height: number;
  alt: string;
  /** 0–1 from the left / top: the point every crop keeps in view. */
  focusX: number;
  focusY: number;
}

export interface PromotionGroupDTO {
  key: string;
  promotions: ShopperPromotionDTO[];
}

/** `GET /storefront/v1/promotion-groups?keys=` and `GET /commerce/v1/promotion-groups?keys=`. */
export interface PromotionGroupsDTO {
  groups: PromotionGroupDTO[];
}

/** The keys the clients ask for (seeded by the 094 migration). Staff may create more. */
export const PROMOTION_GROUP_KEYS = {
  homeHero: "home-hero",
  homeSide: "home-side",
  homeBetween: "home-between",
  offers: "offers",
  cart: "cart",
  /** 095 — the website's All aisles menu. */
  megaNav: "mega-nav",
} as const;

/** A product's offer badge on listings and its page (R11). */
export interface ProductOfferDTO {
  promotionId: string;
  /** "15% off", "Buy 2 get 1 free", "$2 off". */
  label: string;
}

// ── Back-office ─────────────────────────────────────────────────────────────────────────────────

export interface PromotionTargetsDTO {
  products: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  brands: string[];
}

/** A row of the promotions list. */
export interface AdminPromotionListItemDTO {
  id: string;
  name: string;
  kind: PromotionKind;
  trigger: PromotionTrigger;
  state: PromotionState;
  /** "20% off, up to $15" / "Free delivery" / "Buy 2 get 1 free". */
  gives: string;
  /** "Everyone" / "First order" / … */
  who: string;
  /** The shared code, or "N single-use codes", or null for automatic. */
  codeSummary: string | null;
  startsAt: string | null;
  endsAt: string | null;
  uses: number;
  maxUses: number | null;
  groups: string[];
  updatedAt: string;
}

export interface AdminPromotionListDTO extends PagedDTO<AdminPromotionListItemDTO> {
  counts: Record<PromotionState, number>;
}

/** A promotion in full, as the editor and the detail page read it. */
export interface AdminPromotionDTO {
  id: string;
  name: string;
  kind: PromotionKind;
  trigger: PromotionTrigger;
  state: PromotionState;
  valueType: PromotionValueType;
  percentOff: number | null;
  amountOff: string | null;
  maxDiscount: string | null;
  bxgy: { buy: number; get: number; maxPerOrder: number | null } | null;
  appliesTo: PromotionAppliesTo;
  targets: PromotionTargetsDTO;
  deliveryTypes: PromotionDeliveryType[];
  audience: PromotionAudience;
  chosenCustomerCount: number;
  minSubtotal: string;
  minQuantity: number | null;
  startsAt: string | null;
  endsAt: string | null;
  endedAt: string | null;
  daysOfWeek: number[] | null;
  timeFrom: string | null;
  timeTo: string | null;
  maxUses: number | null;
  maxUsesPerCustomer: number | null;
  budget: string | null;
  combinable: boolean;
  sharedCode: string | null;
  singleUseCodeCount: number;
  headline: string | null;
  supportingLine: string | null;
  label: string | null;
  groups: { id: string; key: string; name: string; position: number }[];
  /** 095 — pictures, in order. */
  images: AdminPromotionImageDTO[];
  /** True once any order has held or confirmed a use — what it gives and who it is for are fixed. */
  used: boolean;
  uses: number;
  given: string;
  /** The words a shopper reads — the same composer the clients use. */
  terms: string | null;
  gives: string;
  publishedAt: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** POST /admin/v1/promotions and PATCH /admin/v1/promotions/{id} (partial). */
export interface AdminPromotionWriteDTO {
  name: string;
  kind: PromotionKind;
  trigger: PromotionTrigger;
  valueType: PromotionValueType;
  percentOff?: number | null;
  amountOff?: string | null;
  maxDiscount?: string | null;
  bxgy?: { buy: number; get: number; maxPerOrder?: number | null } | null;
  appliesTo?: PromotionAppliesTo;
  targets?: { productIds?: string[]; categoryIds?: string[]; brands?: string[] };
  deliveryTypes?: PromotionDeliveryType[];
  audience?: PromotionAudience;
  minSubtotal?: string;
  minQuantity?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  daysOfWeek?: number[] | null;
  timeFrom?: string | null;
  timeTo?: string | null;
  maxUses?: number | null;
  maxUsesPerCustomer?: number | null;
  budget?: string | null;
  combinable?: boolean;
  /** For a code promotion with one code everyone shares. */
  sharedCode?: string | null;
  /** Create only: "single_use" makes a code promotion whose codes are generated in batches afterwards. */
  codeMode?: "shared" | "single_use";
  headline?: string | null;
  supportingLine?: string | null;
  label?: string | null;
  groupIds?: string[];
  /** Create only: publish at once instead of saving a draft. */
  publish?: boolean;
  /** PATCH only: the `updatedAt` the editor loaded (409 `stale`). */
  expectedUpdatedAt?: string;
}

export interface AdminPromotionActionRequest {
  action: PromotionAction;
}

export type AdminPromotionAuditDTO = AuditEntryDTO[];

export interface PromotionPerformanceWindowDTO {
  uses: number;
  customers: number;
  discount: string;
  orders: number;
  sales: string;
}

export interface AdminPromotionPerformanceDTO {
  lifetime: PromotionPerformanceWindowDTO;
  last7: PromotionPerformanceWindowDTO;
  last30: PromotionPerformanceWindowDTO;
  budgetLeft: string | null;
}

export type PromotionCodeState = "unused" | "held" | "used";

export interface AdminPromotionCodeDTO {
  code: string;
  state: PromotionCodeState;
  orderId: string | null;
}

export type AdminPromotionCodeListDTO = PagedDTO<AdminPromotionCodeDTO>;

export interface AdminGenerateCodesRequest {
  count: number;
  prefix?: string | null;
}

export interface AdminGenerateCodesResponse {
  batchId: string;
  created: number;
}

export interface AdminPromotionCustomerDTO {
  customerId: string;
  name: string | null;
  email: string;
}

export type AdminPromotionCustomerListDTO = PagedDTO<AdminPromotionCustomerDTO>;

export interface AdminAddPromotionCustomersRequest {
  customerIds?: string[];
  emails?: string[];
}

export interface AdminAddPromotionCustomersResponse {
  added: number;
  unknownEmails: string[];
}

// ── Display groups (back-office) ────────────────────────────────────────────────────────────────

export interface AdminPromotionGroupDTO {
  id: string;
  key: string;
  name: string;
  description: string | null;
  sort: number;
  count: number;
  /** 095 — the size of the place, and the skins its members wear unless they choose one. */
  size: GroupSize;
  defaultSkin: AdminSkinRefDTO;
  /** For promotions with a shared code; null = `defaultSkin`. */
  defaultCodeSkin: AdminSkinRefDTO | null;
}

export interface AdminPromotionGroupMemberDTO {
  promotionId: string;
  name: string;
  headline: string | null;
  state: PromotionState;
  position: number;
  /** 095 — null = the group's default. */
  skinId: string | null;
  /** 095 — null = the best-fitting picture. */
  imageId: string | null;
  /** 095 — the member as shoppers would see it here (skin resolved), for the preview. */
  resolved: ShopperPromotionDTO;
}

export interface AdminPromotionGroupDetailDTO extends AdminPromotionGroupDTO {
  members: AdminPromotionGroupMemberDTO[];
}

export interface AdminCreatePromotionGroupRequest {
  key: string;
  name: string;
  description?: string | null;
}

export interface AdminUpdatePromotionGroupRequest {
  name?: string;
  description?: string | null;
  sort?: number;
  /** 095 */
  size?: GroupSize;
  defaultSkinId?: string;
  defaultCodeSkinId?: string | null;
}

/** 095 — a size change answers the members that were moved back to the default. */
export interface AdminUpdatePromotionGroupResponse extends AdminPromotionGroupDTO {
  reset: string[];
}

export interface AdminPutGroupMembersRequest {
  /** In display order. Ignored when `members` is sent. */
  promotionIds?: string[];
  /** 095 — in display order, with each member's skin and picture (null = the defaults). */
  members?: { promotionId: string; skinId?: string | null; imageId?: string | null }[];
}

export interface AdminPromotionGroupPreviewDTO {
  shown: ShopperPromotionDTO[];
  hidden: { promotionId: string; name: string; why: PromotionState | "personal" }[];
}

// ── Skins and pictures (095, back-office) ───────────────────────────────────────────────────────

export interface AdminSkinRefDTO {
  id: string;
  name: string;
  layout: SkinLayout;
}

export interface AdminSkinListItemDTO extends AdminSkinRefDTO {
  version: number;
  builtIn: boolean;
  /** Placements wearing it, defaults included. */
  usageCount: number;
  /** Absent for `classic`. */
  settings?: SkinSettings;
  updatedAt: string;
}

export interface AdminSkinUsageDTO {
  /** Members that chose this skin. */
  placements: number;
  groups: { id: string; key: string; name: string; members: number }[];
  defaultOf: { id: string; key: string; name: string; forCode: boolean }[];
}

export interface AdminSkinDTO extends AdminSkinListItemDTO {
  usage: AdminSkinUsageDTO;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
}

/** POST /admin/v1/promotion-skins */
export interface AdminCreateSkinRequest {
  name: string;
  layout: DesignedLayout;
  settings: SkinSettings;
}

/** PUT /admin/v1/promotion-skins/{id} */
export interface AdminUpdateSkinRequest {
  name?: string;
  layout?: DesignedLayout;
  settings?: SkinSettings;
  expectedVersion: number;
}

export interface AdminPromotionImageDTO {
  id: string;
  url: string;
  imageWidths?: number[];
  width: number;
  height: number;
  alt: string;
  focusX: number;
  focusY: number;
  position: number;
  usedIn: { id: string; key: string; name: string }[];
}

/** POST /admin/v1/promotions/{id}/images/uploads */
export interface AdminPromotionImageUploadRequest {
  contentType: string;
  fileSize: number;
}

export interface AdminPromotionImageUploadResponse {
  uploadUrl: string;
  storageKey: string;
}

/** POST /admin/v1/promotions/{id}/images */
export interface AdminCreatePromotionImageRequest {
  storageKey: string;
  alt: string;
  focusX?: number;
  focusY?: number;
}

/** PATCH /admin/v1/promotions/{id}/images/{imageId} */
export interface AdminUpdatePromotionImageRequest {
  alt?: string;
  focusX?: number;
  focusY?: number;
  position?: number;
}
