/**
 * The shop audience's notification types, shared by the preferences routes, the attention evaluator
 * and the copy catalogue. `label` is what the settings screen says ("New orders"); `title` is the
 * banner's ("New order to pick"), owned by `worker/copy.ts`.
 */

export type ShopNotificationType =
  | "shop_new_order"
  | "shop_awaiting_pick"
  | "shop_out_of_stock"
  | "shop_low_stock"
  | "shop_refund_proposed"
  // Effy's review decision on a submitted or changed product.
  | "shop_product_approved"
  | "shop_product_sent_back";

export interface ShopNotificationTypeInfo {
  type: ShopNotificationType;
  /** What the settings screen calls it. */
  label: string;
  /** See `worker/copy.ts`. */
  group: "orders" | "attention";
  /** A rendering hint, never the gate: the evaluator filters by the platform record at enqueue. */
  requiresRole?: "shop_manager";
}

export const SHOP_NOTIFICATION_TYPES: readonly ShopNotificationTypeInfo[] = [
  { type: "shop_new_order", label: "New orders", group: "orders" },
  { type: "shop_awaiting_pick", label: "Orders waiting to be picked", group: "attention" },
  { type: "shop_out_of_stock", label: "Products out of stock", group: "attention" },
  { type: "shop_low_stock", label: "Products below reorder point", group: "attention" },
  {
    type: "shop_refund_proposed",
    label: "Refunds waiting for approval",
    group: "attention",
    requiresRole: "shop_manager",
  },
  // Raised by a review decision; grouped with attention because they coalesce the same way.
  { type: "shop_product_approved", label: "Products approved by Effy", group: "attention" },
  { type: "shop_product_sent_back", label: "Products sent back by Effy", group: "attention" },
];

export const KNOWN_SHOP_NOTIFICATION_TYPES: readonly ShopNotificationType[] =
  SHOP_NOTIFICATION_TYPES.map((t) => t.type);

/** Four conditions, four types, independently mutable, one of them manager-only. */
export type AttentionKind = "awaiting_pick" | "out_of_stock" | "low_stock" | "refund_proposed";

export const ATTENTION_TYPE: Record<AttentionKind, ShopNotificationType> = {
  awaiting_pick: "shop_awaiting_pick",
  out_of_stock: "shop_out_of_stock",
  low_stock: "shop_low_stock",
  refund_proposed: "shop_refund_proposed",
};

/** The one kind only a `shop_manager` may act on, so the only one they are told about. */
export const MANAGER_ONLY_KINDS: readonly AttentionKind[] = ["refund_proposed"];
