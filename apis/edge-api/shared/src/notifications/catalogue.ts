// What each kind of notification says, who it is for, which category it belongs to and where a tap leads (109).
//
// Moved here from the notifications worker so the words are known where the notification is written: `notify` stores
// them on the row, and the worker sends the row's words, never this file's (a wording change never rewrites what a
// person was told). No PII: titles and bodies are generic, because lock screens are public.
import {
  serializeDestination,
  type CustomerDestination,
  type DriverDestination,
  type NotificationAudience,
  type NotificationDestination,
  type ShopDestination,
} from "@effy/shared-types";

export type NotificationType =
  | "order_paid"
  | "order_ready"
  | "order_out_for_delivery"
  | "order_delivered"
  | "shop_new_order"
  | "run_assigned"
  | "shop_awaiting_pick"
  | "shop_out_of_stock"
  | "shop_low_stock"
  | "shop_refund_proposed"
  // Effy's review decision on a submitted or changed product.
  | "shop_product_approved"
  | "shop_product_sent_back"
  // Effy's own handling of a shop's products (102).
  | "shop_product_held"
  | "shop_product_released"
  | "shop_product_added_by_effy"
  | "shop_products_imported"
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

/** What a person controls (spec 3). Every type belongs to exactly one, valid for its audience. */
export type NotificationCategory =
  | "orders"
  | "points"
  | "work"
  | "stock"
  | "products"
  | "offers"
  | "news"
  | "important"
  | "support"
  | "announcements";

export type NotificationImportance = "normal" | "important";

/** Orders and attention coalesce by different mechanisms in the shop console's service worker. */
export type NotificationGroup = "orders" | "attention" | "customer" | "driver";

/** What a notification is about. `orderId` is needed where the entity is not the order (a consignment, a move). */
export interface NotificationSubject {
  entityId: string;
  orderId?: string;
}

export interface NotificationEntry {
  audience: NotificationAudience;
  category: NotificationCategory;
  importance: NotificationImportance;
  title: string;
  body: string;
  /** The same tag replaces an earlier banner rather than stacking. */
  tag: string;
  group: NotificationGroup;
  destination: (s: NotificationSubject) => NotificationDestination;
}

function need(value: string | undefined, what: string): string {
  if (!value) throw new Error(`notifications: ${what} is required for this notification's destination`);
  return value;
}

const theOrder = (s: NotificationSubject): CustomerDestination => ({ kind: "order", orderId: need(s.orderId ?? s.entityId, "the order id") });
/** The entity is not the order (a consignment, a move), so the order id must be given. */
const itsOrder = (s: NotificationSubject): CustomerDestination => ({ kind: "order", orderId: need(s.orderId, "the order id") });
const points = (): CustomerDestination => ({ kind: "points" });
const theRun = (s: NotificationSubject): DriverDestination => ({ kind: "run", runId: need(s.entityId, "the run id") });
const today = (): DriverDestination => ({ kind: "today" });
const theQueue = (s: NotificationSubject): ShopDestination =>
  s.entityId ? { kind: "queue", fulfillmentId: s.entityId } : { kind: "queue" };
const theProduct = (s: NotificationSubject): ShopDestination => ({ kind: "product", productId: need(s.entityId, "the product id") });
const catalog = (): ShopDestination => ({ kind: "catalog" });

const customerOrder = { audience: "customer", category: "orders", importance: "normal", tag: "customer-order", group: "customer" } as const;
const driverWork = { audience: "driver", category: "work", importance: "normal", tag: "driver-run", group: "driver" } as const;
const shopAttention = { audience: "shop", importance: "normal", tag: "shop-attention", group: "attention" } as const;

const CATALOGUE: Record<NotificationType, NotificationEntry> = {
  order_paid: { ...customerOrder, title: "Order confirmed", body: "We've received your order.", destination: theOrder },
  // Customer words (109 FR-026): not "ready for handoff".
  order_ready: { ...customerOrder, title: "Your order is packed", body: "It will be on its way to you soon.", destination: theOrder },
  order_out_for_delivery: { ...customerOrder, title: "Out for delivery", body: "Your order is on the way.", destination: theOrder },
  order_delivered: { ...customerOrder, title: "Delivered", body: "Your order has been delivered.", destination: theOrder },
  // The entity is the consignment; the tap opens the order. Never a parcel count.
  order_with_courier: { ...customerOrder, title: "With the courier", body: "Your order is with the courier.", destination: itsOrder },
  // The entity is the move; the tap opens the order. No reason or amount in the banner.
  order_delivery_changed: {
    ...customerOrder,
    title: "A change to your delivery",
    body: "How your order is delivered has changed. Tap to see it.",
    destination: itsOrder,
  },

  // Points: no number in the banner.
  points_credited: {
    audience: "customer", category: "points", importance: "normal", tag: "customer-points", group: "customer",
    title: "You've got Effy points", body: "Points were added to your account. Tap to see them.", destination: points,
  },
  points_expiring: {
    audience: "customer", category: "points", importance: "normal", tag: "customer-points", group: "customer",
    title: "Your points expire soon", body: "Some of your points are about to expire.", destination: points,
  },

  // A driver's work: no stop, address or order in the banner.
  run_assigned: { ...driverWork, title: "Run assigned", body: "A new run has been assigned to you.", destination: theRun },
  run_changed: { ...driverWork, title: "Run updated", body: "A run you're working has changed. Tap to see it.", destination: theRun },
  // No longer theirs: Today says what is.
  run_withdrawn: { ...driverWork, title: "Run removed", body: "A run has been taken off your work.", destination: today },
  run_opens_soon: { ...driverWork, title: "Run opens soon", body: "Your next run opens in a few minutes.", destination: theRun },

  // The entity is the shop_fulfillment id.
  shop_new_order: {
    audience: "shop", category: "orders", importance: "normal", tag: "shop-new-order", group: "orders",
    title: "New order to pick", body: "A new order needs picking.", destination: theQueue,
  },
  // Attention: each opens the screen where the situation is resolved.
  shop_awaiting_pick: { ...shopAttention, category: "orders", title: "Orders waiting to be picked", body: "The pick queue needs attention.", destination: theQueue },
  shop_out_of_stock: { ...shopAttention, category: "stock", title: "Out of stock", body: "A product has run out.", destination: theProduct },
  shop_low_stock: { ...shopAttention, category: "stock", title: "Below reorder point", body: "A product is running low.", destination: theProduct },
  shop_refund_proposed: { ...shopAttention, category: "orders", title: "Refund waiting for approval", body: "A refund needs a manager.", destination: theQueue },

  // Review decisions: no product name, price or reason on a lock screen. Their own tag, so an approval is not replaced
  // by a later attention banner.
  shop_product_approved: {
    audience: "shop", category: "products", importance: "normal", tag: "shop-product-review", group: "attention",
    title: "Product approved", body: "Effy approved a product. It is now on sale.", destination: theProduct,
  },
  shop_product_sent_back: {
    audience: "shop", category: "products", importance: "normal", tag: "shop-product-review", group: "attention",
    title: "Product sent back", body: "Effy sent a product back. Open it to see why.", destination: theProduct,
  },
  // Effy's own handling (102): the reason is read in the console, never on a lock screen.
  shop_product_held: {
    audience: "shop", category: "products", importance: "normal", tag: "shop-product-effy", group: "attention",
    title: "Product held by Effy", body: "Effy took a product off sale. Open it to see why.", destination: theProduct,
  },
  shop_product_released: {
    audience: "shop", category: "products", importance: "normal", tag: "shop-product-effy", group: "attention",
    title: "Product released", body: "Effy released a product it was holding.", destination: theProduct,
  },
  shop_product_added_by_effy: {
    audience: "shop", category: "products", importance: "normal", tag: "shop-product-effy", group: "attention",
    title: "Product added by Effy", body: "Effy added a product for you. It is now on sale.", destination: theProduct,
  },
  // The entity is the import; the tap opens the catalogue.
  shop_products_imported: {
    audience: "shop", category: "products", importance: "normal", tag: "shop-product-effy", group: "attention",
    title: "Products added by Effy", body: "Effy added products from your list.", destination: catalog,
  },
};

export const NOTIFICATION_TYPES = Object.keys(CATALOGUE) as NotificationType[];

/**
 * The database boundary: a row written by a newer producer must be left alone, not thrown on, or one row kills the
 * whole drain.
 */
export function isKnownNotificationType(value: string): value is NotificationType {
  return Object.prototype.hasOwnProperty.call(CATALOGUE, value);
}

export function catalogueEntry(type: NotificationType): NotificationEntry {
  return CATALOGUE[type];
}

/** Where a tap on this notification leads, as stored and sent. */
export function destinationFor(type: NotificationType, subject: NotificationSubject): NotificationDestination {
  return CATALOGUE[type].destination(subject);
}

export { serializeDestination };
