// Notification copy and routing per type. No PII: titles and bodies are generic, and the payload carries
// only a type, an entity id and destinations.
// `webPath` travels beside `deepLink` because a service worker cannot open `effy://` and fcm's
// `fcmOptions.link` fails in iOS home-screen PWAs; both derive from one (type, entityId).
// `tag` / `group` coalesce bursts into one banner.
import type { RecipientToken } from "@effy/edge-shared";

export type NotificationType =
  | "order_paid"
  | "order_ready"
  | "order_out_for_delivery"
  | "order_delivered"
  | "shop_new_order"
  | "run_assigned"
  // Push-only; no email template.
  | "shop_awaiting_pick"
  | "shop_out_of_stock"
  | "shop_low_stock"
  | "shop_refund_proposed"
  // Push-only.
  | "shop_product_approved"
  | "shop_product_sent_back"
  // `points_credited` is push + email; `points_expiring` is email only.
  | "points_credited"
  | "points_expiring"
  // Push + email, once per consignment.
  | "order_with_courier"
  // Push + email, once per move.
  | "order_delivery_changed"
  | "run_changed"
  | "run_withdrawn"
  | "run_opens_soon";

/** Orders and attention coalesce by different mechanisms, so they are counted separately. */
export type NotificationGroup = "orders" | "attention" | "customer" | "driver";

export interface NotificationCopy {
  title: string;
  body: string;
  /** The mobile route family; the app resolves it with `entityId`. */
  deepLinkPath: string;
  /** The web path in the owning console. Must resolve to a declared route. */
  webPath: string;
  /** The same tag replaces rather than stacks. */
  tag: string;
  group: NotificationGroup;
  /** False when the destination is a screen with no per-entity route. Default true. */
  entityInLink?: false;
}

const COPY: Record<NotificationType, NotificationCopy> = {
  order_paid: {
    title: "Order confirmed",
    body: "We've received your order.",
    deepLinkPath: "order",
    webPath: "/orders",
    tag: "customer-order",
    group: "customer",
  },
  order_ready: {
    title: "Your order is ready",
    body: "Your order is ready for handoff.",
    deepLinkPath: "order",
    webPath: "/orders",
    tag: "customer-order",
    group: "customer",
  },
  order_out_for_delivery: {
    title: "Out for delivery",
    body: "Your order is on the way.",
    deepLinkPath: "order",
    webPath: "/orders",
    tag: "customer-order",
    group: "customer",
  },
  order_delivered: {
    title: "Delivered",
    body: "Your order has been delivered.",
    deepLinkPath: "order",
    webPath: "/orders",
    tag: "customer-order",
    group: "customer",
  },
  shop_new_order: {
    // `entityId` is the shop_fulfillment id.
    title: "New order to pick",
    body: "A new order needs picking.",
    deepLinkPath: "queue",
    webPath: "/orders",
    tag: "shop-new-order",
    group: "orders",
  },
  run_assigned: {
    title: "Run assigned",
    body: "A new run has been assigned to you.",
    deepLinkPath: "run",
    webPath: "/runs",
    tag: "driver-run",
    group: "driver",
  },

  // Attention: each opens the screen where the situation is resolved.
  shop_awaiting_pick: {
    title: "Orders waiting to be picked",
    body: "The pick queue needs attention.",
    deepLinkPath: "queue",
    webPath: "/orders",
    tag: "shop-attention",
    group: "attention",
  },
  shop_out_of_stock: {
    title: "Out of stock",
    body: "A product has run out.",
    deepLinkPath: "product",
    webPath: "/catalog",
    tag: "shop-attention",
    group: "attention",
  },
  shop_low_stock: {
    title: "Below reorder point",
    body: "A product is running low.",
    deepLinkPath: "product",
    webPath: "/catalog",
    tag: "shop-attention",
    group: "attention",
  },
  shop_refund_proposed: {
    title: "Refund waiting for approval",
    body: "A refund needs a manager.",
    deepLinkPath: "order",
    webPath: "/orders",
    tag: "shop-attention",
    group: "attention",
  },

  // Review decisions: no product name, price or reason on a lock screen. Their own tag, so an approval
  // is not replaced by a later attention banner.
  shop_product_approved: {
    title: "Product approved",
    body: "Effy approved a product. It is now on sale.",
    deepLinkPath: "product",
    webPath: "/catalog",
    tag: "shop-product-review",
    group: "attention",
  },
  shop_product_sent_back: {
    title: "Product sent back",
    body: "Effy sent a product back. Open it to see why.",
    deepLinkPath: "product",
    webPath: "/catalog",
    tag: "shop-product-review",
    group: "attention",
  },

  // Points: no number in the banner.
  points_credited: {
    title: "You've got Effy points",
    body: "Points were added to your account. Tap to see them.",
    deepLinkPath: "points",
    webPath: "/account?tab=points",
    tag: "customer-points",
    group: "customer",
    entityInLink: false,
  },
  points_expiring: {
    title: "Your points expire soon",
    body: "Some of your points are about to expire.",
    deepLinkPath: "points",
    webPath: "/account?tab=points",
    tag: "customer-points",
    group: "customer",
    entityInLink: false,
  },

  // Courier: the entity is the consignment, so the tap opens the orders. Never a parcel count.
  order_with_courier: {
    title: "With the courier",
    body: "Your order is with the courier.",
    deepLinkPath: "order",
    webPath: "/orders",
    tag: "customer-order",
    group: "customer",
    entityInLink: false,
  },

  // Courier override: the entity is the move. No reason or amount in the banner.
  order_delivery_changed: {
    title: "A change to your delivery",
    body: "How your order is delivered has changed. Tap to see it.",
    deepLinkPath: "order",
    webPath: "/orders",
    tag: "customer-order",
    group: "customer",
    entityInLink: false,
  },

  // A driver's work changing: no stop, address or order in the banner.
  run_changed: {
    title: "Run updated",
    body: "A run you're working has changed. Tap to see it.",
    deepLinkPath: "run",
    webPath: "/runs",
    tag: "driver-run",
    group: "driver",
  },
  // The app finds the run is no longer theirs and shows Today.
  run_withdrawn: {
    title: "Run removed",
    body: "A run has been taken off your work.",
    deepLinkPath: "run",
    webPath: "/runs",
    tag: "driver-run",
    group: "driver",
  },
  run_opens_soon: {
    title: "Run opens soon",
    body: "Your next run opens in a few minutes.",
    deepLinkPath: "run",
    webPath: "/runs",
    tag: "driver-run",
    group: "driver",
  },
};

export const NOTIFICATION_TYPES = Object.keys(COPY) as NotificationType[];

/**
 * Type guard for the database boundary: a row written by a newer producer must be left pending,
 * not thrown on, or one row kills the whole drain.
 */
export function isKnownNotificationType(value: string): value is NotificationType {
  return Object.prototype.hasOwnProperty.call(COPY, value);
}

export function copyFor(type: NotificationType): NotificationCopy {
  return COPY[type];
}

export function deepLinkFor(type: NotificationType, entityId: string): string {
  const c = copyFor(type);
  return entityId && c.entityInLink !== false ? `effy://${c.deepLinkPath}/${entityId}` : `effy://${c.deepLinkPath}`;
}

/** Set by the server, not the service worker, so routes live in one place. Entity-less types get the bare path. */
export function webPathFor(type: NotificationType, entityId: string): string {
  const c = copyFor(type);
  return entityId && c.entityInLink !== false ? `${c.webPath}/${entityId}` : c.webPath;
}

/** Every value must be a string: FCM rejects others. */
export function dataFor(type: NotificationType, entityId: string): Record<string, string> {
  const c = copyFor(type);
  return {
    type,
    entityId,
    deepLink: deepLinkFor(type, entityId),
    webPath: webPathFor(type, entityId),
    // Web messages have no `notification` block (see `fcm/sender.ts`); mobile ignores these.
    title: c.title,
    body: c.body,
    tag: c.tag,
    group: c.group,
  };
}

export type { RecipientToken };
