// Turn one order into the `order-confirmation` variables and send it. 052 US3.
//
// ⚠ EVERY MONEY VALUE, QUANTITY AND DATE IS FORMATTED HERE, not in the template (email-kit FR-048).
// SES has no formatting helpers and a template handed a raw number cannot format it, so the catalogue
// declares every one of these as a pre-formatted string. This module is where "3.60" becomes "$3.60".
import { logger } from "@effy/edge-shared";
import { identityFromEnv, MailConfigError } from "@effy/email-kit";
import { sendEmail } from "@effy/email-kit/send";

import type { PendingReceipt, ReceiptSendResult } from "./drain";
import { loadReceipt, type ReceiptArrivalRow, type ReceiptItemRow } from "./repository";

/** The trading timezone. "Today" is a claim about the SHOPPER'S day, not the server's. */
const TZ = "Australia/Melbourne";

function money(amount: string | null, currency: string): string {
  const n = Number(amount ?? "0");
  if (!Number.isFinite(n)) return `${currency} ${amount ?? "0"}`;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currency || "AUD",
    currencyDisplay: "narrowSymbol",
  }).format(n);
}

function isPositive(amount: string | null): boolean {
  const n = Number(amount ?? "0");
  return Number.isFinite(n) && n > 0;
}

/** An address snapshot rendered as the lines a person reads. Unknown shapes degrade to nothing. */
function addressLines(a: Record<string, unknown> | null): string {
  if (!a) return "";
  const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
  return [
    s("recipientName"),
    [s("line1"), s("line2")].filter(Boolean).join(", "),
    [s("city"), s("region"), s("postalCode")].filter(Boolean).join(" "),
    s("country"),
  ]
    .filter(Boolean)
    .join("\n");
}

function formatPlacedAt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: TZ,
  }).format(d);
}

function methodLabel(method: string): string {
  if (method === "same_day") return "Same-day";
  if (method === "scheduled") return "Scheduled";
  return "Standard";
}

function day(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short" }).format(d);
}

/**
 * The arrival estimate, in the plainest words the DATA supports.
 *
 * ⚠ A DATE OR DATE RANGE, NEVER A TIME (research R4). `promised_from`/`promised_to` are `date`
 * columns; the platform has no delivery window. And when there is no promise at all it SAYS SO —
 * inventing a date on a receipt would be a false fact on a financial record.
 */
export function arrivalText(arrivals: ReceiptArrivalRow[]): { estimate: string; method: string } {
  if (arrivals.length === 0) return { estimate: "a date we'll confirm", method: "Delivery" };

  const method = arrivals.length > 1 ? "Multiple deliveries" : methodLabel(arrivals[0]!.method);
  const froms = arrivals.map((a) => a.promised_from ?? a.promised_to).filter(Boolean) as string[];
  const tos = arrivals.map((a) => a.promised_to ?? a.promised_from).filter(Boolean) as string[];
  if (froms.length === 0) return { estimate: "a date we'll confirm", method };

  const from = froms.reduce((a, b) => (a < b ? a : b));
  const to = tos.reduce((a, b) => (a > b ? a : b), from);

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  if (from === to) {
    if (from === today) return { estimate: "today", method };
    return { estimate: day(from), method };
  }
  return { estimate: `${day(from)} – ${day(to)}`, method };
}

/** "Visa ending 4242" / "Klarna" / "" — never any card field beyond last4 (051). */
export function paymentText(
  type: string | null,
  brand: string | null,
  last4: string | null,
): string {
  if (!type) return "";
  const label = brand ? brand.replace(/_/g, " ") : type === "pay_over_time" ? "pay over time" : type;
  const nice = label.charAt(0).toUpperCase() + label.slice(1);
  return last4 ? `${nice} ending ${last4}` : nice;
}

export interface ReceiptSenderOptions {
  /** The storefront origin, for the "View your order" link. */
  siteUrl: string;
}

/**
 * Build the sender half of the drain deps.
 *
 * ⚠ `mailerConfigured` is resolved ONCE here, not per row. An unset `MAIL_SENDER` means this
 * deployment cannot send at all, and the drain then leaves every row pending rather than burning the
 * attempt budget on a misconfiguration (fail-open, 050 FR-027).
 */
export function createReceiptSender(opts: ReceiptSenderOptions) {
  let identity: ReturnType<typeof identityFromEnv> | null = null;
  try {
    identity = identityFromEnv();
  } catch (err) {
    if (!(err instanceof MailConfigError)) throw err;
    logger.warn({ err }, "receipts: mail is not configured — leaving every dispatch pending");
  }

  return {
    mailerConfigured: identity !== null,

    async send(req: PendingReceipt): Promise<ReceiptSendResult | null> {
      if (!identity) return { ok: false, error: "mail_not_configured" };

      const loaded = await loadReceipt(req.orderId);
      // ⚠ null means the order can no longer be read. The drain marks this `skipped`, because there is
      // nothing to retry — an order that vanished will not reappear.
      if (!loaded) return null;

      const { order, items, arrivals } = loaded;
      const currency = order.currency || "AUD";
      const arrival = arrivalText(arrivals);

      const vars = {
        orderNumber: order.order_number,
        placedAt: formatPlacedAt(order.placed_at),
        deliveryEstimate: arrival.estimate,
        deliveryMethod: arrival.method,
        items: items.map((i: ReceiptItemRow) => ({
          name: i.product_name,
          quantity: String(i.quantity),
          unitPrice: money(i.unit_price_amount, currency),
          lineTotal: money(i.line_subtotal_amount, currency),
        })),
        subtotal: money(order.item_subtotal_amount, currency),
        // ⚠ A zero component is OMITTED, never printed as "$0.00" or a dash: on a financial record
        // "nothing" and "unknown" are different claims (FR-004).
        hasDiscount: isPositive(order.discount_amount),
        discountLabel: order.promo_code ? `Discount ${order.promo_code}` : "Discount",
        discountAmount: money(order.discount_amount, currency),
        hasDeliveryFee: isPositive(order.delivery_fee_amount),
        deliveryFee: money(order.delivery_fee_amount, currency),
        total: money(order.grand_total_amount, currency),
        hasPaymentMethod: Boolean(order.method_type),
        paymentMethod: paymentText(order.method_type, order.method_brand, order.method_last4),
        deliveryAddress: addressLines(order.delivery_address),
        billingSameAsDelivery: !order.billing_address,
        billingAddress: addressLines(order.billing_address),
        orderUrl: `${opts.siteUrl.replace(/\/$/, "")}/orders/${req.orderId}`,
      };

      const res = await sendEmail(
        "order-confirmation",
        vars,
        { to: req.recipient, audience: "customer" },
        logger,
      );

      return res.outcome === "sent"
        ? { ok: true, messageId: res.messageId }
        : { ok: false, error: "send_failed" };
    },
  };
}
