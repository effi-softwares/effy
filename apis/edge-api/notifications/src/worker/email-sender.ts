// The EMAIL channel of the notification drain (053 US3).
//
// ⚠ IT RESOLVES WHAT IT RENDERS AT SEND TIME, from the entity id alone. The outbox payload is
// contractually no-PII (050 FR-021) because a push payload traverses FCM, so nothing about the
// customer or their order travels through `notification_request` — only routing ids. This module is
// where an order id becomes a name and a date.
//
// ⚠ THE ADDRESS IS NOT RESOLVED HERE. It was snapshotted onto the row at enqueue (052's rule), so a
// customer who later changes their account email does not retroactively redirect a message about an
// order that has already arrived. This module is handed the address; it must never look one up.
import { logger, query } from "@effy/edge-shared";
import { identityFromEnv, MailConfigError } from "@effy/email-kit";
import { sendEmail } from "@effy/email-kit/send";

import type { SendResult } from "../fcm/sender";
import type { NotificationType } from "./copy";

/** The trading timezone. A delivery date is a claim about the SHOPPER'S day, not the server's. */
const TZ = "Australia/Melbourne";

/**
 * Which notification types have an email counterpart.
 *
 * ⚠ THE SCOPE BOUNDARY, IN CODE (research R8). 053 adds the email channel and uses it for
 * `order_delivered` ONLY. `order_ready` and `order_out_for_delivery` stay push-only — adding them is
 * a values change for a later slice, not scope to take now.
 *
 * ⚠ `order_paid` MUST NEVER APPEAR HERE. It already has an email — 052's receipt, via its own
 * `receipt_dispatch` outbox. A second one for the same event is a defect, not coverage.
 */
const EMAIL_TEMPLATES = {
  order_delivered: "order-delivered",
} as const satisfies Partial<Record<NotificationType, string>>;

export function hasEmailTemplate(type: NotificationType): boolean {
  return type in EMAIL_TEMPLATES;
}

interface DeliveredRow {
  order_number: string;
  delivered_at: string | null;
}

/** The order's facts, and the day its LAST package arrived. */
async function loadDelivered(orderId: string): Promise<DeliveredRow | null> {
  const res = await query<DeliveredRow>(
    `SELECT o.order_number,
            (SELECT MAX(pa.arrived_at)
               FROM public.shop_fulfillment sf
               JOIN public.package_arrival pa ON pa.shop_fulfillment_id = sf.id
              WHERE sf.order_id = o.id) AS delivered_at
       FROM public."order" o
      WHERE o.id = $1`,
    [orderId],
  );
  return res.rows[0] ?? null;
}

/**
 * ⚠ A DATE, NEVER A TIME OF DAY. The platform has no delivery window (052 research R4) and the
 * arrival timestamp is when a person pressed a button, not when the doorbell rang. Printing
 * "delivered at 3:42 pm" would state a precision the record does not have, on a message a customer
 * may later use to dispute something.
 */
function formatDeliveredOn(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  const when = Number.isNaN(d.getTime()) ? new Date() : d;
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "full", timeZone: TZ }).format(when);
}

export interface EmailSenderOptions {
  /** Absolute base URL of the storefront, for the order link. */
  siteUrl: string;
}

export function createEmailSender(opts: EmailSenderOptions) {
  let identity: ReturnType<typeof identityFromEnv> | null = null;
  try {
    identity = identityFromEnv();
  } catch (err) {
    if (!(err instanceof MailConfigError)) throw err;
    logger.warn({ err }, "notifications: mail is not configured — email rows will retry");
  }

  return {
    mailerConfigured: identity !== null,

    async send(to: string, type: NotificationType, entityId: string): Promise<SendResult> {
      if (!identity) return { ok: false, prune: false, errorClass: "mail_not_configured" };
      if (!hasEmailTemplate(type)) {
        // A row asking for a channel this type does not have. Not retryable — the type will not
        // grow a template on the next tick.
        return { ok: false, prune: false, errorClass: "no_email_template" };
      }

      const loaded = await loadDelivered(entityId);
      if (!loaded) return { ok: false, prune: false, errorClass: "order_not_found" };

      const res = await sendEmail(
        "order-delivered",
        {
          orderNumber: loaded.order_number,
          deliveredOn: formatDeliveredOn(loaded.delivered_at),
          orderUrl: `${opts.siteUrl.replace(/\/$/, "")}/orders/${entityId}`,
        },
        { to, audience: "customer" },
        logger,
      );

      return res.outcome === "sent"
        ? { ok: true, prune: false }
        // ⚠ `prune` is meaningless on this channel and is always false. It exists on SendResult for
        // FCM, where a dead token must be deleted; an email address that bounces is 037's
        // deliverability path, not this worker's to act on.
        : { ok: false, prune: false, errorClass: "send_failed" };
    },
  };
}
