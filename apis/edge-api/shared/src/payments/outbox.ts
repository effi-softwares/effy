import type { Queryable } from "../lib/db";

/** A push-notification intent for the notifications worker to deliver. */
export interface NotificationRequest {
  recipientSub: string;
  audience: "customer" | "shop" | "driver";
  type: string;
  /** orderId | fulfillmentId | runId */
  entityId: string;
  /** Where a tap lands: `effy://order/<id>`. */
  deepLink: string;
}

/** Enqueues a notification in the caller's transaction, once per dedupe key. Routing ids only. */
export async function appendNotification(tx: Queryable, r: NotificationRequest): Promise<void> {
  await tx.query(
    `
INSERT INTO public.notification_request (recipient_sub, audience, type, payload, dedupe_key)
VALUES ($1, $2, $3, $4::jsonb, $5)
ON CONFLICT (dedupe_key) DO NOTHING`,
    [
      r.recipientSub, r.audience, r.type,
      JSON.stringify({ entityId: r.entityId, deepLink: r.deepLink }),
      `${r.type}:${r.recipientSub}:${r.entityId}`,
    ],
  );
}
