// Notification copy + deep-link routing per type. 050-observability-push-foundation.
//
// ⚠ NO PII (FR-021). Titles/bodies are GENERIC — the specifics live on the in-app screen the deep link
// opens, never in the push text. The payload carries only a `type`, an `entityId`, and a `deepLink`.
// Copy is config here (not hardcoded at a call site); a later slice can localise it.
import type { RecipientToken } from "@effy/edge-shared";

export type NotificationType =
  | "order_paid"
  | "order_ready"
  | "order_out_for_delivery"
  | "order_delivered"
  | "shop_new_order"
  | "run_assigned";

export interface NotificationCopy {
  title: string;
  body: string;
  /** The in-app route family the tap opens; the app resolves it with `entityId`. */
  deepLinkPath: string;
}

const COPY: Record<NotificationType, NotificationCopy> = {
  order_paid: { title: "Order confirmed", body: "We've received your order.", deepLinkPath: "order" },
  order_ready: {
    title: "Your order is ready",
    body: "Your order is ready for handoff.",
    deepLinkPath: "order",
  },
  order_out_for_delivery: {
    title: "Out for delivery",
    body: "Your order is on the way.",
    deepLinkPath: "order",
  },
  order_delivered: {
    title: "Delivered",
    body: "Your order has been delivered.",
    deepLinkPath: "order",
  },
  shop_new_order: {
    title: "New order to pick",
    body: "A new order needs picking.",
    deepLinkPath: "queue",
  },
  run_assigned: {
    title: "Run assigned",
    body: "A new run has been assigned to you.",
    deepLinkPath: "run",
  },
};

export function copyFor(type: NotificationType): NotificationCopy {
  return COPY[type];
}

/** Build the `effy://` deep link for a type + entity (FR-017). */
export function deepLinkFor(type: NotificationType, entityId: string): string {
  return `effy://${copyFor(type).deepLinkPath}/${entityId}`;
}

/** The `data` block every message carries (all strings — FCM `data` values must be strings). */
export function dataFor(type: NotificationType, entityId: string): Record<string, string> {
  return { type, entityId, deepLink: deepLinkFor(type, entityId) };
}

export type { RecipientToken };
