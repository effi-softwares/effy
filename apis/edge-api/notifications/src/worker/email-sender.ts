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
import { customerCompensationOf } from "@effy/edge-shared/delivery";
import { customerWords, type EntryKind } from "@effy/edge-shared/points";
import { compensationLine, courierEstimateSentence, DELIVERY_TYPE_WORDS, formatArrival, movedLines } from "@effy/shared-types";
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
  // 074 — a points credit, and the one warning before points expire.
  points_credited: "points-credited",
  points_expiring: "points-expiring",
  // 080 — one per consignment: the per-parcel tracking the order page says is sent by email.
  order_with_courier: "order-with-courier",
  // 081 — one per move by back-office: what changed, when it now arrives, what the customer received.
  order_delivery_changed: "order-delivery-changed",
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

// ── 074 points ─────────────────────────────────────────────────────────────────────────────────────

const points = (n: number) => new Intl.NumberFormat("en-AU").format(n);
const dollars = (cents: number) => (cents / 100).toFixed(2);
/** A Melbourne yyyy-mm-dd written out, at noon so no zone can move it to another day. */
const longDate = (ymd: string) => new Intl.DateTimeFormat("en-AU", { dateStyle: "full", timeZone: TZ }).format(new Date(`${ymd}T12:00:00+10:00`));

/**
 * One credit, resolved at send time from its entry id (the payload carries nothing else). The reason
 * words come from the same closed vocabulary the account page uses; the staff note is not selected.
 */
async function loadCredited(entryId: string) {
  const row = (
    await query<{ kind: string; points: number; reason: string; order_number: string | null; last_day: string; cents_per_point: number }>(
      `SELECT e.kind, e.points, e.reason, o.order_number,
              ((e.expires_at - interval '1 second') AT TIME ZONE '${TZ}')::date::text AS last_day,
              (SELECT cents_per_point FROM public.points_settings WHERE id = 1) AS cents_per_point
         FROM public.points_entry e
         LEFT JOIN public."order" o ON o.id = e.order_id
        WHERE e.id = $1 AND e.points > 0`,
      [entryId],
    )
  ).rows[0];
  if (!row) return null;
  return {
    points: points(row.points),
    valueAmount: dollars(row.points * row.cents_per_point),
    reasonWords: customerWords(row.kind as EntryKind, row.reason, row.order_number),
    expiresOn: longDate(row.last_day),
  };
}

async function loadExpiring(noticeId: string) {
  const row = (
    await query<{ points: number; expiry_date: string; cents_per_point: number }>(
      `SELECT n.points, n.expiry_date::text AS expiry_date,
              (SELECT cents_per_point FROM public.points_settings WHERE id = 1) AS cents_per_point
         FROM public.points_expiry_notice n WHERE n.id = $1`,
      [noticeId],
    )
  ).rows[0];
  if (!row) return null;
  return { points: points(row.points), valueAmount: dollars(row.points * row.cents_per_point), expiresOn: longDate(row.expiry_date) };
}

// ── 080 courier ───────────────────────────────────────────────────────────────────────────────────

/**
 * One consignment, resolved at send time from its id. ⚠ Selects nothing about the shop, the other
 * parcels or the fee — the template has no var for them.
 */
async function loadWithCourier(consignmentId: string) {
  return (
    await query<{ order_id: string; order_number: string; courier_name: string; reference: string | null; tracking_url: string | null }>(
      `SELECT o.id::text AS order_id, o.order_number, s.courier_name, c.reference, c.tracking_url
         FROM public.courier_consignment c
         JOIN public.courier_service s ON s.id = c.courier_service_id
         JOIN public.shop_fulfillment sf ON sf.id = c.shop_fulfillment_id
         JOIN public."order" o ON o.id = sf.order_id
        WHERE c.id = $1`,
      [consignmentId],
    )
  ).rows[0] ?? null;
}

// ── 081 courier override ──────────────────────────────────────────────────────────────────────────

/**
 * One move, resolved at send time from its id, into the shared wording. ⚠ Selects nothing about the
 * staff reason, the courier fee or the difference — the template has no var for them.
 */
async function loadDeliveryChanged(overrideId: string) {
  const row = (
    await query<{
      order_id: string; order_number: string; to_type: "effy" | "courier"; compensation: string; amount_cents: number; points: number | null;
      estimate: string | null; window_start: string | null; window_end: string | null;
    }>(
      `SELECT o.id::text AS order_id, o.order_number, x.to_type, x.compensation, x.amount_cents, x.points,
              s.estimate_text AS estimate, x.window_start::text AS window_start, x.window_end::text AS window_end
         FROM public.delivery_override x
         JOIN public."order" o ON o.id = x.order_id
         LEFT JOIN public.courier_service s ON s.id = x.courier_service_id
        WHERE x.id = $1`,
      [overrideId],
    )
  ).rows[0];
  if (!row) return null;
  const moved = { to: row.to_type, at: "", compensation: customerCompensationOf(row) };
  const comp = row.to_type === "courier" ? compensationLine(moved.compensation) : null;
  const arrivalLine = row.to_type === "courier"
    ? courierEstimateSentence(row.estimate ?? "")
    : `${DELIVERY_TYPE_WORDS.effy} · ${formatArrival({ promisedFrom: null, promisedTo: null, windowStart: row.window_start, windowEnd: row.window_end }, new Date())}`;
  return {
    orderId: row.order_id,
    orderNumber: row.order_number,
    movedLine: movedLines(moved)[0]!,
    arrivalLine,
    hasCompensation: comp !== null,
    compensationLine: comp ?? "",
  };
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

      const site = opts.siteUrl.replace(/\/$/, "");
      let res: Awaited<ReturnType<typeof sendEmail>>;
      if (type === "points_credited" || type === "points_expiring") {
        const pointsUrl = `${site}/account?tab=points`;
        if (type === "points_credited") {
          const loaded = await loadCredited(entityId);
          if (!loaded) return { ok: false, prune: false, errorClass: "points_entry_not_found" };
          res = await sendEmail("points-credited", { ...loaded, pointsUrl }, { to, audience: "customer" }, logger);
        } else {
          const loaded = await loadExpiring(entityId);
          if (!loaded) return { ok: false, prune: false, errorClass: "points_notice_not_found" };
          res = await sendEmail("points-expiring", { ...loaded, pointsUrl, shopUrl: `${site}/` }, { to, audience: "customer" }, logger);
        }
      } else if (type === "order_delivery_changed") {
        const c = await loadDeliveryChanged(entityId);
        if (!c) return { ok: false, prune: false, errorClass: "delivery_override_not_found" };
        const { orderId, ...vars } = c;
        res = await sendEmail("order-delivery-changed", { ...vars, orderUrl: `${site}/orders/${orderId}` }, { to, audience: "customer" }, logger);
      } else if (type === "order_with_courier") {
        const c = await loadWithCourier(entityId);
        if (!c) return { ok: false, prune: false, errorClass: "consignment_not_found" };
        res = await sendEmail(
          "order-with-courier",
          {
            orderNumber: c.order_number,
            courierName: c.courier_name,
            hasReference: c.reference !== null,
            reference: c.reference ?? "",
            hasTracking: c.tracking_url !== null,
            trackingUrl: c.tracking_url ?? "",
            orderUrl: `${site}/orders/${c.order_id}`,
          },
          { to, audience: "customer" },
          logger,
        );
      } else {
        const loaded = await loadDelivered(entityId);
        if (!loaded) return { ok: false, prune: false, errorClass: "order_not_found" };
        res = await sendEmail(
          "order-delivered",
          {
            orderNumber: loaded.order_number,
            deliveredOn: formatDeliveredOn(loaded.delivered_at),
            orderUrl: `${site}/orders/${entityId}`,
          },
          { to, audience: "customer" },
          logger,
        );
      }

      return res.outcome === "sent"
        ? { ok: true, prune: false }
        // ⚠ `prune` is meaningless on this channel and is always false. It exists on SendResult for
        // FCM, where a dead token must be deleted; an email address that bounces is 037's
        // deliverability path, not this worker's to act on.
        : { ok: false, prune: false, errorClass: "send_failed" };
    },
  };
}
