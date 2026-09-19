/**
 * The shop audience's notification types — 059-shop-web-pwa.
 *
 * ⚠ IN `@effy/edge-shared` BECAUSE THREE SERVICES NEED THE SAME ANSWER (Principle II):
 *   • `edge-shop`'s preferences routes serve this list to the settings screen;
 *   • `edge-shop`'s attention evaluator decides which type each occurrence enqueues;
 *   • `edge-notifications`' copy catalogue renders them.
 * A copy in any one of those would be the two-sources-for-one-fact shape this repo has shipped five
 * defects through — and the way it would show up is an operator muting a type that the evaluator
 * then keeps sending, with nothing failing anywhere.
 *
 * ⚠ `label` IS NOT `title`. The label is what the SETTINGS SCREEN calls this ("New orders"); the
 * title is what the BANNER says ("New order to pick"). They are different strings for different
 * jobs, and `worker/copy.ts` owns the second. This is not duplication.
 */

export type ShopNotificationType =
  | "shop_new_order"
  | "shop_awaiting_pick"
  | "shop_out_of_stock"
  | "shop_low_stock"
  | "shop_refund_proposed";

export interface ShopNotificationTypeInfo {
  type: ShopNotificationType;
  /** What the settings screen calls it. */
  label: string;
  /** Which coalescing group it belongs to — see `worker/copy.ts`. */
  group: "orders" | "attention";
  /**
   * A role this type is restricted to, if any.
   *
   * ⚠ A RENDERING HINT, NEVER THE GATE. The evaluator filters `shop_refund_proposed` by the
   * PLATFORM RECORD at enqueue time, regardless of what any client does with this field. A
   * preference hidden by CSS is still a preference, and "the client won't show it" is not access
   * control (Principle IV).
   */
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
];

export const KNOWN_SHOP_NOTIFICATION_TYPES: readonly ShopNotificationType[] =
  SHOP_NOTIFICATION_TYPES.map((t) => t.type);

/**
 * The four attention CONDITIONS, and the notification type each one raises.
 *
 * ⚠ FOUR KINDS, FOUR TYPES, ONE MAPPING. The alternative — one `shop_attention` type — was refused
 * because the four behave nothing alike: two resolve within the hour, two can stay true for days,
 * and one is manager-only. FR-024 requires them independently switchable and FR-022 requires one
 * filtered by role; a single type makes both unrepresentable.
 */
export type AttentionKind = "awaiting_pick" | "out_of_stock" | "low_stock" | "refund_proposed";

export const ATTENTION_KINDS: readonly AttentionKind[] = [
  "awaiting_pick",
  "out_of_stock",
  "low_stock",
  "refund_proposed",
];

export const ATTENTION_TYPE: Record<AttentionKind, ShopNotificationType> = {
  awaiting_pick: "shop_awaiting_pick",
  out_of_stock: "shop_out_of_stock",
  low_stock: "shop_low_stock",
  refund_proposed: "shop_refund_proposed",
};

/** The one attention kind only a `shop_manager` may act on, and so the only one they are told about. */
export const MANAGER_ONLY_KINDS: readonly AttentionKind[] = ["refund_proposed"];
