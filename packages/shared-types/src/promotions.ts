import type { AuditEntryDTO, PagedDTO } from "./shop";
import type { BannerTarget } from "./storefront";

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
}

export interface AdminPromotionGroupMemberDTO {
  promotionId: string;
  name: string;
  headline: string | null;
  state: PromotionState;
  position: number;
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
}

export interface AdminPutGroupMembersRequest {
  /** In display order. */
  promotionIds: string[];
}

export interface AdminPromotionGroupPreviewDTO {
  shown: ShopperPromotionDTO[];
  hidden: { promotionId: string; name: string; why: PromotionState | "personal" }[];
}
