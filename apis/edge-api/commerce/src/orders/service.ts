// The customer's order history and receipt (019, 052, 055, 066, 069). No HTTP, no SQL.
//
// The receipt is ONE order itemised by product, with an ANONYMOUS per-package summary: a shop's
// identity never appears, and neither does how many shops there were beyond the packages shown.
import {
  countsAsRefundedToCustomer, customerCancellable, customerRefundState, formatCents, imageUrlOrNull,
  operatingStamp, parseCents, stageFor, type RequestScope,
} from "@effy/edge-shared";
import type { CustomerRefundDTO, OrderDTO, OrderSummaryDTO } from "@effy/shared-types";

import { isUuid } from "../lib/ids";
import type { OrderRow, OrdersRepository, RefundRow } from "./repository";

/** Raised for a missing order AND for someone else's — the two are indistinguishable by design. */
export class OrderNotFoundError extends Error {}

type Presign = (key: string | null) => Promise<string | null>;

/**
 * What has happened to the shopper's money (055 FR-023), or nothing at all.
 *
 * ⚠ AN ORDER WITH NO REFUNDS GETS NO KEYS — not an empty array, not "0.00", not `false`. It must
 * read exactly as it did before refunds existed (055 SC-011).
 * ⚠ INTEGER CENTS, formatted once. A refund puts a second set of figures on a document whose first
 * set must already add up.
 * ⚠ THE RECEIPT ITSELF IS NOT REWRITTEN (FR-024): the totals above stay what was CHARGED, and a
 * refund is a later event shown beside them — so the order still reconciles to a bank statement.
 */
export interface RefundBlock {
  refunds?: CustomerRefundDTO[];
  refundedTotal?: string;
  amountPaidAfterRefunds?: string;
  fullyRefunded?: true;
}

export function refundBlock(grandTotal: string, rows: readonly RefundRow[]): RefundBlock {
  if (rows.length === 0) return {};
  let refundedCents = 0;
  const refunds = rows.map((r) => {
    if (countsAsRefundedToCustomer(r.status)) refundedCents += parseCents(r.amount);
    return { amount: r.amount, state: customerRefundState(r.status), refundedAt: r.settled_at };
  });
  const paidCents = parseCents(grandTotal);
  const fullyRefunded = paidCents > 0 && refundedCents >= paidCents; // `> 0`: a free order is not "fully refunded"
  return {
    refunds,
    refundedTotal: formatCents(refundedCents),
    amountPaidAfterRefunds: formatCents(Math.max(0, paidCents - refundedCents)),
    // ⚠ Derived from the totals, never stored — and absent, not false, when it is not so.
    ...(fullyRefunded ? { fullyRefunded: true } : {}),
  };
}

/**
 * 074 — how the order was paid when points were part of it, and what has come back of each (FR-018,
 * FR-028). ⚠ ABSENT on an order that used no points, so such an order reads exactly as before 074.
 * ⚠ Points are a way of paying, shown beside the card — never a discount line.
 */
export function paymentSplit(row: Pick<OrderRow, "points_used" | "points_value_amount" | "card_paid_amount">, refunds: readonly RefundRow[]) {
  if (!row.points_used) return {};
  let cardReturned = 0;
  let pointsReturned = 0;
  for (const r of refunds) {
    if (!countsAsRefundedToCustomer(r.status)) continue;
    cardReturned += parseCents(r.card_amount ?? r.amount);
    pointsReturned += r.points_returned ?? 0;
  }
  return {
    paymentSplit: {
      pointsUsed: row.points_used,
      pointsAmount: row.points_value_amount ?? "0.00",
      cardAmount: row.card_paid_amount ?? "0.00",
      pointsReturned,
      cardReturned: formatCents(cardReturned),
    },
  };
}

export function createOrdersService(deps: { repo: OrdersRepository; presign?: Presign }) {
  const { repo } = deps;
  const presign = deps.presign ?? imageUrlOrNull;

  /** A supporting read: its failure must never cost the shopper their receipt. */
  async function optional<T>(scope: Pick<RequestScope, "log">, what: string, read: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await read();
    } catch (err) {
      scope.log.warn({ err }, `orders: ${what} unavailable — receipt served without it`);
      return fallback;
    }
  }

  return {
    async list(customerId: string): Promise<OrderSummaryDTO[]> {
      return (await repo.list(customerId)).map((r) => ({
        id: r.id, orderNumber: r.order_number, status: r.status as OrderSummaryDTO["status"], placedAt: r.placed_at,
        itemCount: r.item_count, grandTotalAmount: r.grand_total_amount, currency: r.currency,
      }));
    },

    async get(scope: Pick<RequestScope, "log">, customerId: string, orderId: string): Promise<OrderDTO> {
      if (!isUuid(orderId)) throw new OrderNotFoundError();
      const row = await repo.get(customerId, orderId);
      if (!row) throw new OrderNotFoundError();

      const [items, portions, short] = await Promise.all([repo.items(orderId), repo.fulfillments(orderId), repo.shortfalls(orderId)]);
      const [arrivals, method, refunds] = await Promise.all([
        optional(scope, "arrival estimates", () => repo.arrivals(orderId), []),
        optional(scope, "payment method", () => repo.paymentMethod(orderId), null),
        optional(scope, "refunds", () => repo.refunds(orderId), []),
      ]);

      const shortByPortion = new Map<string, { productName: string; quantity: number }[]>();
      for (const s of short) {
        const list = shortByPortion.get(s.shop_fulfillment_id) ?? [];
        list.push({ productName: s.product_name, quantity: s.quantity });
        shortByPortion.set(s.shop_fulfillment_id, list);
      }
      const statuses = portions.map((p) => p.status);

      const order = {
        id: row.id,
        orderNumber: row.order_number,
        status: row.status,
        placedAt: row.placed_at,
        items: await Promise.all(
          items.map(async (it) => {
            // ⚠ A presign failure is swallowed: a photograph must not be able to fail a receipt.
            const imageUrl = await presign(it.image_key).catch(() => null);
            return {
              orderItemId: it.order_item_id, productId: it.product_id, productName: it.product_name,
              unitPriceAmount: it.unit_price_amount, quantity: it.quantity, lineSubtotalAmount: it.line_subtotal_amount,
              // Absent, not null or "", when there is no image.
              ...(imageUrl ? { imageUrl } : {}),
            };
          }),
        ),
        deliveryAddress: row.delivery_address ?? {},
        // Absent means "billing is the same as shipping". Never defaulted to {}.
        ...(row.billing_address ? { billingAddress: row.billing_address } : {}),
        // null when the customer said nothing; always present so a client can rely on the key.
        deliveryInstructions:
          row.delivery_handover === null && row.delivery_note === null ? null : { handover: row.delivery_handover, note: row.delivery_note },
        itemSubtotalAmount: row.item_subtotal_amount,
        discountAmount: row.discount_amount,
        deliveryFeeAmount: row.delivery_fee_amount,
        // 077 — the same charge as lines. ⚠ Absent on an order placed before 077, which has only
        // the single amount above; never an empty array standing in for "unknown".
        ...(row.delivery_fee_lines ? { deliveryFee: { lines: row.delivery_fee_lines, totalAmount: row.delivery_fee_amount } } : {}),
        promoCode: row.promo_code,
        grandTotalAmount: row.grand_total_amount,
        currency: row.currency,
        paymentStatus: row.payment_status ?? "requires_payment",
        fulfillments: portions.map((p) => {
          const unavailableItems = shortByPortion.get(p.id);
          return {
            status: p.status, itemCount: p.item_count, subtotalAmount: p.subtotal_amount,
            // ⚠ Absent while the portion is still being picked, so a flag later undone never shows.
            ...(unavailableItems ? { unavailableItems } : {}),
          };
        }),
        // ⚠ Both DERIVED HERE and put on the wire; no client computes either.
        stage: stageFor(statuses),
        cancellable: customerCancellable(row.status, statuses),
        ...refundBlock(row.grand_total_amount, refunds),
        ...paymentSplit(row, refunds),
        // null on an order whose method was never captured; the client omits the line.
        paymentMethod: method?.method_type ? { type: method.method_type, brand: method.method_brand, last4: method.method_last4 } : null,
        // Always an array. ⚠ Dates stay dates; a window carries the Melbourne offset (069 FR-029).
        arrivalEstimates: arrivals.map((a) => ({
          method: a.method, promisedFrom: a.promised_from, promisedTo: a.promised_to,
          windowStart: a.window_start ? operatingStamp(a.window_start) : null,
          windowEnd: a.window_end ? operatingStamp(a.window_end) : null,
        })),
      };
      return order as unknown as OrderDTO;
    },
  };
}

export type OrdersService = ReturnType<typeof createOrdersService>;
