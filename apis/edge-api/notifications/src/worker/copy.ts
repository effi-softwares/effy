// Notification copy + deep-link routing per type. 050-observability-push-foundation; extended by
// 059-shop-web-pwa.
//
// ⚠ NO PII (050 FR-021). Titles/bodies are GENERIC — the specifics live on the in-app screen the
// deep link opens, never in the push text. The payload carries only a `type`, an `entityId`, and the
// destinations. Copy is config here (not hardcoded at a call site); a later slice can localise it.
//
// ── 059 ─────────────────────────────────────────────────────────────────────────────────────────
// Three additions, each with a reason that is not obvious:
//
//   • `webPath` BESIDE `deepLink`. A service worker cannot open `effy://`, and FCM's own
//     `fcmOptions.link` — the one mechanism it offers for "open this URL" — DOES NOT WORK in an iOS
//     home-screen PWA, which is this audience's primary device. So the destination has to travel in
//     `data` regardless of who opens it. Both forms are derived from ONE (type, entityId) and a test
//     pins that they agree: 029 hit this exact fork and recorded the answer, after shipping a banner
//     whose tap opened the unfiltered store because two places disagreed about where it led.
//
//   • `tag` / `group`, for coalescing. Twenty orders in a minute must not be twenty banners — the
//     web `showNotification` tag replaces rather than stacks, and browsers now rate-limit senders
//     whose notifications go unengaged.
//
//   • FOUR ATTENTION TYPES, not one `shop_attention`. The four behave nothing alike: two resolve
//     within the hour, two can stay true for days, and one is manager-only. 059 FR-024 requires them
//     independently switchable and FR-022 requires one filtered by role — a single type makes both
//     unrepresentable.
import type { RecipientToken } from "@effy/edge-shared";

export type NotificationType =
  | "order_paid"
  | "order_ready"
  | "order_out_for_delivery"
  | "order_delivered"
  | "shop_new_order"
  | "run_assigned"
  // 059 — the shop's four attention conditions. Push-only: they get no email template, deliberately.
  | "shop_awaiting_pick"
  | "shop_out_of_stock"
  | "shop_low_stock"
  | "shop_refund_proposed";

/**
 * Which notification group a type belongs to, for coalescing and badge counting on the web.
 *
 * ⚠ Orders and attention are counted separately because they coalesce by different mechanisms in
 * different places: orders arrive one transaction at a time and are collapsed by the service
 * worker's `tag`; attention arrives as a whole set and is collapsed by the evaluator that produced
 * it. Sharing one counter would make "3 new orders" and "3 things need attention" overwrite each
 * other's banner.
 */
export type NotificationGroup = "orders" | "attention" | "customer" | "driver";

export interface NotificationCopy {
  title: string;
  body: string;
  /** The in-app route family the tap opens on MOBILE; the app resolves it with `entityId`. */
  deepLinkPath: string;
  /**
   * The WEB route family the tap opens, as a leading-slash path in the console that owns it.
   *
   * ⚠ Must resolve to a declared route. A notification that opens a 404 is worse than no
   * notification: the operator learns the feature lies, and stops tapping the ones that work.
   */
  webPath: string;
  /** The `showNotification` tag — the coalescing group. The same tag replaces rather than stacks. */
  tag: string;
  group: NotificationGroup;
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
    // ⚠ The shop console's order-detail route (057 A3). `entityId` is the shop_fulfillment id.
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

  // ── 059 attention kinds ───────────────────────────────────────────────────────────────────────
  // ⚠ Each opens the screen where the situation is RESOLVED, not one that merely mentions it
  // (FR-021). A notification whose tap lands somewhere the operator must then navigate away from is
  // a notification that taught them nothing.
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
};

/** Every type, for exhaustive iteration in tests and in the preferences contract. */
export const NOTIFICATION_TYPES = Object.keys(COPY) as NotificationType[];

/**
 * Is this string a type THIS BUILD knows? A type guard for the database boundary.
 *
 * ⚠ 059'S READER AUDIT ADDED THIS, and where it is called matters more than what it does.
 * `PendingRow.type` in `repository.ts` is an UNCHECKED assertion — the row is cast to
 * `NotificationType` on the way out of PostgreSQL with nothing verifying it. So in the window
 * between deploying a producer that writes a new type and deploying this consumer, a row arrives
 * carrying a type that is not in `COPY`. `copyFor` then returns `undefined` and the caller throws on
 * `.title` — which does not skip that row, it KILLS THE WHOLE DRAIN, taking every other audience's
 * notifications down with it. That is 053's "an unconfigured FCM halted the whole drain" defect
 * arriving by a different road.
 *
 * ⚠ THE CHECK BELONGS AT THE CAST, NOT AT EVERY CONSUMER. Making `copyFor` return
 * `NotificationCopy | undefined` was the first attempt and it was wrong: it pushes an impossible
 * case onto every call site that already holds a valid `NotificationType`, and it forces existing
 * tests to change, which would have cost the "these suites pass unmodified" proof. The lie is the
 * cast in the repository; that is the one place that has to stop lying.
 *
 * The mandated deploy order (notifications BEFORE the producer) makes the window empty. This makes
 * the window survivable.
 */
export function isKnownNotificationType(value: string): value is NotificationType {
  return Object.prototype.hasOwnProperty.call(COPY, value);
}

/** Copy for a type. Total over `NotificationType` — `COPY` is an exhaustive `Record`. */
export function copyFor(type: NotificationType): NotificationCopy {
  return COPY[type];
}

/** Build the `effy://` deep link for a type + entity (050 FR-017). Mobile. */
export function deepLinkFor(type: NotificationType, entityId: string): string {
  const c = copyFor(type);
  return entityId ? `effy://${c.deepLinkPath}/${entityId}` : `effy://${c.deepLinkPath}`;
}

/**
 * Build the in-console path for a type + entity (059). Web.
 *
 * ⚠ SET BY THE SERVER, not mapped in the service worker. Mapping type→route inside the SW would put
 * the console's route table in two places, and a route rename would break notifications with nothing
 * failing anywhere. 029 settled this: the server sets both forms from one id, and a test pins that
 * they agree.
 *
 * ⚠ An entity-less type (an aggregate such as `shop_awaiting_pick`) yields the bare family path —
 * never one with a trailing slash or the string "undefined" in it.
 */
export function webPathFor(type: NotificationType, entityId: string): string {
  const c = copyFor(type);
  return entityId ? `${c.webPath}/${entityId}` : c.webPath;
}

/**
 * The `data` block every message carries.
 *
 * ⚠ EVERY VALUE MUST BE A STRING. FCM rejects a non-string `data` value, and it does so in a way
 * that is easy to miss — the send fails, the row is retried, and the cause sits one field deep in a
 * provider error. A test asserts the whole object is strings.
 */
export function dataFor(type: NotificationType, entityId: string): Record<string, string> {
  const c = copyFor(type);
  return {
    type,
    entityId,
    deepLink: deepLinkFor(type, entityId),
    webPath: webPathFor(type, entityId),
    // ⚠ Carried in `data` because a WEB message has no `notification` block to put them in — see
    // `fcm/sender.ts`. Mobile ignores these and renders the `notification` block FCM sends.
    title: c.title,
    body: c.body,
    tag: c.tag,
    group: c.group,
  };
}

export type { RecipientToken };
