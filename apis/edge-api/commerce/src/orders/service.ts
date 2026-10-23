// The receipt itemises by product with an anonymous per-package summary: no shop ever appears.
import {
  countsAsRefundedToCustomer, customerCancellable, customerRefundState, formatCents, imageWidthsField,
  operatingStamp, parseCents, publicImageAddress, stageFor, widthsOf, type RequestScope,
} from "@effy/edge-shared";
import { customerCompensationOf } from "@effy/edge-shared/delivery";
import { distinctArrivals, type CustomerRefundDTO, type DeliveryPromise, type OrderDeliveryDTO, type OrderDTO, type OrderSummaryDTO } from "@effy/shared-types";

import { isUuid } from "../lib/ids";
import type { OrderRow, OrdersRepository, RefundRow } from "./repository";

/** Missing and someone else's are deliberately indistinguishable. */
export class OrderNotFoundError extends Error {}

type ImageAddress = (key: string | null) => Promise<string | null>;

/**
 * What has happened to the shopper's money. An order with no refunds gets no keys at all. The
 * charged totals are never rewritten: refunds are shown beside them, so the order still reconciles.
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
  const fullyRefunded = paidCents > 0 && refundedCents >= paidCents;
  return {
    refunds,
    refundedTotal: formatCents(refundedCents),
    amountPaidAfterRefunds: formatCents(Math.max(0, paidCents - refundedCents)),
    // Absent, not false, when it is not so.
    ...(fullyRefunded ? { fullyRefunded: true } : {}),
  };
}

/** Absent when no points were used. Points are a way of paying, never a discount line. */
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

/** The courier timeframe is the order's own copy as sold, never today's setting. */
function deliveryOf(row: {
  delivery_type: "effy" | "courier";
  courier_estimate?: string | null;
  delivery_promise?: DeliveryPromise | null;
  asap_estimate?: string | null;
  parcel_count?: number;
  consignments_out?: number;
  only_tracking_url?: string | null;
  only_courier_name?: string | null;
  moved_to?: "effy" | "courier" | null;
  moved_at?: string | null;
  moved_compensation?: string | null;
  moved_amount_cents?: number | null;
  moved_points?: number | null;
}): { delivery: OrderDeliveryDTO } {
  const courier = row.delivery_type === "courier";
  const tracking = courier ? trackingOf(row) : undefined;
  const moved = movedOf(row);
  return {
    delivery: {
      type: row.delivery_type, courierEstimate: courier ? row.courier_estimate ?? null : null,
      ...(courier ? {} : { promise: row.delivery_promise! }),
      ...(!courier && row.delivery_promise === "asap" && row.asap_estimate ? { asapEstimate: row.asap_estimate } : {}),
      ...(tracking ? { tracking } : {}), ...(moved ? { moved } : {}),
    },
  };
}

/**
 * The arrival a customer may be told, from what was sold rather than the packages: a day-only order's
 * packages carry the Any-time window's hours, and an asap order was told only an estimate.
 */
function soldArrivals<T extends { windowStart: string | null; windowEnd: string | null }>(
  row: { delivery_type?: "effy" | "courier" | null; delivery_promise?: DeliveryPromise | null },
  arrivals: T[],
): T[] {
  if (row.delivery_type === "courier" || row.delivery_promise === "asap") return [];
  if (row.delivery_promise === "day") return arrivals.map((a) => ({ ...a, windowStart: null, windowEnd: null }));
  return arrivals;
}

/** Absent when back-office never moved the order. */
function movedOf(row: {
  moved_to?: "effy" | "courier" | null; moved_at?: string | null; moved_compensation?: string | null;
  moved_amount_cents?: number | null; moved_points?: number | null;
}): OrderDeliveryDTO["moved"] {
  if (!row.moved_to || !row.moved_at) return undefined;
  const compensation = row.moved_to === "courier"
    ? customerCompensationOf({ compensation: row.moved_compensation ?? "none", amount_cents: row.moved_amount_cents ?? 0, points: row.moved_points ?? null })
    : null;
  return { to: row.moved_to, at: new Date(row.moved_at).toISOString(), compensation };
}

/**
 * How a customer follows a courier order: nothing yet or one parcel with no link → absent; several
 * parcels → "sent by email"; one with a link → that link. Never a count.
 */
export function trackingOf(row: {
  parcel_count?: number;
  consignments_out?: number;
  only_tracking_url?: string | null;
  only_courier_name?: string | null;
}): OrderDeliveryDTO["tracking"] {
  const out = row.consignments_out ?? 0;
  if (out === 0) return undefined;
  if (out > 1 || (row.parcel_count ?? 1) > 1) return { kind: "email" };
  return row.only_tracking_url ? { kind: "link", url: row.only_tracking_url, courierName: row.only_courier_name ?? "" } : undefined;
}

export function createOrdersService(deps: { repo: OrdersRepository; imageAddress?: ImageAddress }) {
  const { repo } = deps;
  const imageAddress = deps.imageAddress ?? publicImageAddress;

  /** Its failure must never cost the shopper their receipt. */
  async function optional<T>(scope: Pick<RequestScope, "log">, what: string, read: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await read();
    } catch (err) {
      scope.log.warn({ err }, `orders: ${what} unavailable — receipt served without it`);
      return fallback;
    }
  }

  return {
    /**
     * Each row's stage, promise, arrival, refund and pictures come from the same functions the receipt
     * uses, so the list and the order page agree. Each is absent when it does not apply.
     */
    async list(customerId: string): Promise<OrderSummaryDTO[]> {
      return Promise.all((await repo.list(customerId)).map(async (r) => {
        const paid = r.status === "paid";
        const stage = paid && r.portion_statuses ? stageFor(r.portion_statuses) : undefined;
        const arrivals = distinctArrivals(soldArrivals(r, (r.arrivals ?? []).map((a) => ({
          method: a.method, promisedFrom: a.promised_from, promisedTo: a.promised_to,
          // json_agg returns timestamps as text; the receipt's read returns a Date.
          windowStart: a.window_start ? operatingStamp(new Date(a.window_start)) : null,
          windowEnd: a.window_end ? operatingStamp(new Date(a.window_end)) : null,
        }))));
        const refunded = refundBlock(r.grand_total_amount, (r.refunds ?? []) as RefundRow[]);
        // A failed picture address is a missing picture, never a failed list.
        const refs = r.image_refs ?? undefined;
        const thumbnails = refs ? await Promise.all(refs.map((ref) => imageAddress(ref.key).catch(() => null))) : undefined;
        // Sent only when at least one thumbnail has copies.
        const thumbnailWidths = refs?.map((ref) => widthsOf(ref.widths));
        return {
          id: r.id, orderNumber: r.order_number, status: r.status as OrderSummaryDTO["status"], placedAt: r.placed_at,
          itemCount: r.item_count, grandTotalAmount: r.grand_total_amount, currency: r.currency,
          ...deliveryOf(r),
          ...(stage ? { stage } : {}),
          ...(arrivals.length > 0 ? { arrivalEstimates: arrivals as OrderSummaryDTO["arrivalEstimates"] } : {}),
          ...(stage === "delivered" && r.delivered_at ? { deliveredAt: new Date(r.delivered_at).toISOString() } : {}),
          ...(refunded.refundedTotal && refunded.refundedTotal !== "0.00" ? { refundedTotal: refunded.refundedTotal } : {}),
          ...(refunded.fullyRefunded ? { fullyRefunded: true as const } : {}),
          ...(thumbnails ? { thumbnails } : {}),
          ...(thumbnailWidths?.some((w) => w.length > 0) ? { thumbnailWidths } : {}),
        };
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
            // A failed picture address must not fail the receipt.
            const imageUrl = await imageAddress(it.image_key).catch(() => null);
            return {
              orderItemId: it.order_item_id, productId: it.product_id, productName: it.product_name,
              variantId: it.variant_id, variantLabel: it.variant_label,
              unitPriceAmount: it.unit_price_amount, quantity: it.quantity, lineSubtotalAmount: it.line_subtotal_amount,
              discountAmount: it.discount_amount,
              ...(imageUrl ? { imageUrl, ...imageWidthsField(it.image_widths) } : {}),
            };
          }),
        ),
        deliveryAddress: row.delivery_address ?? {},
        // Absent means billing is the same as shipping.
        ...(row.billing_address ? { billingAddress: row.billing_address } : {}),
        deliveryInstructions:
          row.delivery_handover === null && row.delivery_note === null ? null : { handover: row.delivery_handover, note: row.delivery_note },
        itemSubtotalAmount: row.item_subtotal_amount,
        discountAmount: row.discount_amount,
        deliveryFeeAmount: row.delivery_fee_amount,
        deliveryFee: { lines: row.delivery_fee_lines, totalAmount: row.delivery_fee_amount },
        promoCode: row.promo_code,
        promotions: (row.promotions ?? []).map((p) => ({ headline: p.headline ?? p.name, code: p.code, goodsAmount: p.goods, deliveryAmount: p.delivery })),
        deliveryDiscountAmount: row.delivery_discount_amount,
        grandTotalAmount: row.grand_total_amount,
        currency: row.currency,
        paymentStatus: row.payment_status ?? "requires_payment",
        fulfillments: portions.map((p) => {
          const unavailableItems = shortByPortion.get(p.id);
          return {
            status: p.status, itemCount: p.item_count, subtotalAmount: p.subtotal_amount,
            // Absent while the portion is being picked, so a flag later undone never shows.
            ...(unavailableItems ? { unavailableItems } : {}),
          };
        }),
        stage: stageFor(statuses),
        cancellable: customerCancellable(row.status, statuses),
        ...refundBlock(row.grand_total_amount, refunds),
        ...paymentSplit(row, refunds),
        paymentMethod: method?.method_type ? { type: method.method_type, brand: method.method_brand, last4: method.method_last4 } : null,
        // One entry per distinct promise, from what was sold. Empty for a courier order: its packages'
        // "standard" is routing, not what the customer bought.
        arrivalEstimates: distinctArrivals(soldArrivals(row, arrivals.map((a) => ({
          method: a.method, promisedFrom: a.promised_from, promisedTo: a.promised_to,
          windowStart: a.window_start ? operatingStamp(a.window_start) : null,
          windowEnd: a.window_end ? operatingStamp(a.window_end) : null,
        })))),
        ...deliveryOf(row),
      };
      return order as unknown as OrderDTO;
    },
  };
}

export type OrdersService = ReturnType<typeof createOrdersService>;
