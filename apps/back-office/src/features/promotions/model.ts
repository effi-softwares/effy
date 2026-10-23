import type {
  AdminPromotionDTO,
  AdminPromotionListItemDTO,
  AuditEntryDTO,
  OrderPolicyDTO,
  PromotionKind,
  PromotionState,
  PromotionTrigger,
  UpdateOrderPolicyRequest,
} from "@effy/shared-types";

/**
 * Domain shapes for back-office promotions. The wire DTOs are the domain shapes here; every
 * read and write still goes through the repo layer (Principle VI).
 */
export type Promotion = AdminPromotionDTO;
export type PromotionRow = AdminPromotionListItemDTO;
export type OrderPolicy = OrderPolicyDTO;
export type AuditEntry = AuditEntryDTO;
export type { UpdateOrderPolicyRequest };

export interface PromotionListParams {
  page: number;
  pageSize: number;
  q?: string;
  state?: PromotionState;
  kind?: PromotionKind;
  trigger?: PromotionTrigger;
  groupId?: string;
}

/** Each state as a word and its tone — one place, so the list and the page agree. */
export const STATE_WORD: Record<PromotionState, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  active: "Active",
  paused: "Paused",
  used_up: "Used up",
  out_of_budget: "Out of budget",
  ended: "Ended",
  archived: "Archived",
};

export const STATE_TONE = {
  draft: "muted",
  scheduled: "info",
  active: "done",
  paused: "waiting",
  used_up: "quiet",
  out_of_budget: "quiet",
  ended: "quiet",
  archived: "muted",
} as const;

export const KIND_WORD: Record<PromotionKind, string> = {
  cart: "Money off the cart",
  item: "Money off items",
  bxgy: "Buy X get Y",
  delivery: "Delivery",
};

/** "312 of 500" / "7 used" — against the cap when there is one. */
export function usesLabel(p: { uses: number; maxUses: number | null }): string {
  return p.maxUses ? `${p.uses.toLocaleString("en-AU")} of ${p.maxUses.toLocaleString("en-AU")}` : `${p.uses.toLocaleString("en-AU")} used`;
}
