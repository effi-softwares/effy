// Turn one order into the `order-confirmation` variables and send it. 052 US3.
//
// ⚠ EVERY MONEY VALUE, QUANTITY AND DATE IS FORMATTED HERE, not in the template (email-kit FR-048).
// SES has no formatting helpers and a template handed a raw number cannot format it, so the catalogue
// declares every one of these as a pre-formatted string. This module is where "3.60" becomes "$3.60".
import { ARRIVAL_UNCONFIRMED, DELIVERY_FEE_LINE_LABEL, distinctArrivals, formatArrival, type DeliveryFeeLineKind } from "@effy/shared-types";
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

/**
 * 077 — the delivery lines as the template takes them. Labels come from the one file that writes
 * them; an unknown kind (a newer backend) is dropped rather than printed as a code.
 */
export function deliveryLinesVars(
  lines: { kind: string; amount: string }[] | null | undefined,
  currency: string,
): { hasDeliveryLines: boolean; deliveryLines: { label: string; amount: string }[] } {
  const known = (lines ?? []).filter((l): l is { kind: DeliveryFeeLineKind; amount: string } => l.kind in DELIVERY_FEE_LINE_LABEL);
  return {
    hasDeliveryLines: known.length > 0,
    deliveryLines: known.map((l) => ({ label: DELIVERY_FEE_LINE_LABEL[l.kind], amount: money(l.amount, currency) })),
  };
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

/**
 * The arrival estimate, in the plainest words the DATA supports.
 *
 * ⚠ THE WORDING IS `formatArrival`'S, NOT THIS FILE'S (069). The confirmation page and the order
 * page call the same function, so the email cannot say "Thursday" while the page says "today, 5 pm –
 * 7 pm". This file used to carry its own date formatting beside customer-web's; 052 deleted a second
 * implementation of one rule for exactly this reason.
 *
 * An order can arrive in more than one delivery — a same-day window for one package and a chosen day
 * for another — so each DISTINCT promise is said once, joined with "and". When there is no promise at
 * all it SAYS SO: inventing a date on a receipt would be a false fact on a financial record.
 *
 * `now` is a parameter so "today" is testable; the drain passes the moment it sends.
 */
export function arrivalText(
  arrivals: ReceiptArrivalRow[],
  now: Date = new Date(),
): { estimate: string; method: string } {
  if (arrivals.length === 0) return { estimate: UNCONFIRMED, method: "Delivery" };

  // ⚠ 078 — counted as PROMISES, not packages. Every package of an order sold one window carries
  // the same promise: that is one delivery, and calling it "Multiple deliveries" told the customer
  // how many suppliers filled it.
  const promises = distinctArrivals(arrivals.map((a) => ({
    method: a.method,
    promisedFrom: a.promised_from,
    promisedTo: a.promised_to,
    windowStart: a.window_start ? a.window_start.toISOString() : null,
    windowEnd: a.window_end ? a.window_end.toISOString() : null,
  })));
  const method = promises.length > 1 ? "Multiple deliveries" : methodLabel(promises[0]!.method);

  const said: string[] = [];
  for (const p of promises) {
    const text = formatArrival(p, now);
    if (text !== ARRIVAL_UNCONFIRMED && !said.includes(text)) said.push(text);
  }
  if (said.length === 0) return { estimate: UNCONFIRMED, method };

  // The estimate sits mid-sentence in the template ("Arriving …"), so "Today" reads as "today".
  return { estimate: said.map(midSentence).join(" and "), method };
}

/** What the receipt says when the platform has promised no day. Every order placed before 069. */
const UNCONFIRMED = "a date we'll confirm";

function midSentence(text: string): string {
  return text.startsWith("Today") || text.startsWith("Tomorrow")
    ? text.charAt(0).toLowerCase() + text.slice(1)
    : text;
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
        // 077 — the lines the customer was sold, in the words the checkout used. Printed in place of
        // the single row; a free delivery IS printed, because it is something they were sold.
        ...deliveryLinesVars(order.delivery_fee_lines, currency),
        total: money(order.grand_total_amount, currency),
        hasPaymentMethod: Boolean(order.method_type),
        // 074 — with points in the mix, each way of paying states its own amount so the two add up.
        paymentMethod: order.points_used
          ? `${paymentText(order.method_type, order.method_brand, order.method_last4)} (${money(order.card_paid_amount ?? "0", currency)})`
          : paymentText(order.method_type, order.method_brand, order.method_last4),
        hasPoints: Boolean(order.points_used),
        pointsPaid: order.points_used
          ? `${new Intl.NumberFormat("en-AU").format(order.points_used)} Effy points (${money(order.points_value_amount ?? "0", currency)})`
          : "",
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
