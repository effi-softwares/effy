// Every money value, quantity and date is formatted here: SES templates cannot format.
import {
  ARRIVAL_UNCONFIRMED, asapSentence, courierEstimateSentence, DELIVERY_WINDOW_WORDS, courierLines, DELIVERY_FEE_LINE_LABEL, DELIVERY_TYPE_WORDS, distinctArrivals, formatArrival,
  type DeliveryFeeLineKind,
} from "@effy/shared-types";
import { logger } from "@effy/edge-shared";
import { identityFromEnv, MailConfigError } from "@effy/email-kit";
import { sendEmail } from "@effy/email-kit/send";

import type { PendingReceipt, ReceiptSendResult } from "./drain";
import { loadReceipt, type ReceiptArrivalRow, type ReceiptItemRow } from "./repository";

/** "Today" is the shopper's day, not the server's. */
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

/** An unknown kind is dropped rather than printed as a code. */
export function deliveryLinesVars(
  lines: { kind: string; amount: string }[],
  currency: string,
): { hasDeliveryLines: boolean; deliveryLines: { label: string; amount: string }[] } {
  const known = lines.filter((l): l is { kind: DeliveryFeeLineKind; amount: string } => l.kind in DELIVERY_FEE_LINE_LABEL);
  return {
    hasDeliveryLines: known.length > 0,
    deliveryLines: known.map((l) => ({ label: DELIVERY_FEE_LINE_LABEL[l.kind], amount: money(l.amount, currency) })),
  };
}

function isPositive(amount: string | null): boolean {
  const n = Number(amount ?? "0");
  return Number.isFinite(n) && n > 0;
}

/** Unknown shapes degrade to nothing. */
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
 * Worded by `formatArrival`, as the confirmation and order pages are. Each distinct promise is said
 * once, joined with "and"; with none it says so rather than inventing a date.
 */
export function arrivalText(
  arrivals: ReceiptArrivalRow[],
  now: Date = new Date(),
): { estimate: string; method: string } {
  if (arrivals.length === 0) return { estimate: UNCONFIRMED, method: "Delivery" };

  // Counted as promises, not packages.
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

  // Mid-sentence ("Arriving …"), so "Today" reads as "today".
  return { estimate: said.map(midSentence).join(" and "), method };
}

/**
 * A courier order never reads its packages ("standard" is routing): it says who delivers and the
 * estimate sold, in the checkout's own sentences (`courierLines`).
 */
export function deliveryVars(
  order: { delivery_type?: string | null; courier_estimate?: string | null; delivery_promise?: string | null; asap_estimate?: string | null },
  arrivals: ReceiptArrivalRow[],
  now: Date = new Date(),
): { deliveryLabel: string; deliveryEstimate: string; deliveryMethod: string; deliveryPreheader: string } {
  if (order.delivery_type === "courier" && order.courier_estimate) {
    return {
      deliveryLabel: DELIVERY_TYPE_WORDS.courier,
      deliveryEstimate: courierLines(order.courier_estimate).join(" "),
      // Empty, so the template prints no "· method".
      deliveryMethod: "",
      deliveryPreheader: courierEstimateSentence(order.courier_estimate),
    };
  }
  // Asap was told an estimate, never the planned day.
  if (order.delivery_promise === "asap" && order.asap_estimate) {
    const sentence = asapSentence(order.asap_estimate);
    return { deliveryLabel: DELIVERY_TYPE_WORDS.effy, deliveryEstimate: sentence, deliveryMethod: "", deliveryPreheader: `${sentence}.` };
  }
  // A day with no time: never the hours of the window it rides.
  if (order.delivery_promise === "day") {
    const arrival = arrivalText(arrivals.map((a) => ({ ...a, window_start: null, window_end: null })), now);
    const estimate = `${arrival.estimate}, ${DELIVERY_WINDOW_WORDS.anyTimeDay.toLowerCase()}`;
    return { deliveryLabel: "Arriving", deliveryEstimate: estimate, deliveryMethod: arrival.method, deliveryPreheader: `Arriving ${estimate}.` };
  }
  const arrival = arrivalText(arrivals, now);
  return { deliveryLabel: "Arriving", deliveryEstimate: arrival.estimate, deliveryMethod: arrival.method, deliveryPreheader: `Arriving ${arrival.estimate}.` };
}

const UNCONFIRMED = "a date we'll confirm";

function midSentence(text: string): string {
  return text.startsWith("Today") || text.startsWith("Tomorrow")
    ? text.charAt(0).toLowerCase() + text.slice(1)
    : text;
}

/** Never any card field beyond last4. */
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
  siteUrl: string;
}

/** `mailerConfigured` is resolved once: unconfigured, the drain leaves every row pending. */
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
      // null: the order can no longer be read; skipped.
      if (!loaded) return null;

      const { order, items, arrivals } = loaded;
      const currency = order.currency || "AUD";

      const vars = {
        orderNumber: order.order_number,
        placedAt: formatPlacedAt(order.placed_at),
        ...deliveryVars(order, arrivals),
        items: items.map((i: ReceiptItemRow) => ({
          name: i.product_name,
          quantity: String(i.quantity),
          unitPrice: money(i.unit_price_amount, currency),
          lineTotal: money(i.line_subtotal_amount, currency),
        })),
        subtotal: money(order.item_subtotal_amount, currency),
        // A zero component is omitted, never "$0.00". One line per promotion, so the lines add up.
        hasDiscount: isPositive(discountTotal(order)),
        discountLabel: order.promotion_names?.length
          ? `Discount · ${order.promotion_names.join(", ")}`
          : "Discount",
        discountAmount: money(discountTotal(order), currency),
        hasDeliveryFee: isPositive(order.delivery_fee_amount),
        deliveryFee: money(order.delivery_fee_amount, currency),
        // The fee lines as sold; a free delivery is printed.
        ...deliveryLinesVars(order.delivery_fee_lines, currency),
        total: money(order.grand_total_amount, currency),
        hasPaymentMethod: Boolean(order.method_type),
        // With points, each way of paying states its own amount.
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

function discountTotal(order: { discount_amount: string | null; delivery_discount_amount?: string | null }): string {
  const cents = (v: string | null | undefined) => Math.round(Number(v ?? "0") * 100);
  return ((cents(order.discount_amount) + cents(order.delivery_discount_amount)) / 100).toFixed(2);
}
