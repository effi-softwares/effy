// Repository for purchase orders (057, US6): raw SQL, shop-scoped, transactional on the writes that
// move stock. Every query is bound to the caller-resolved shop id (never client input).
import { query, withTransaction } from "@effy/edge-shared";

import type {
  PurchaseOrderDTO,
  PurchaseOrderLineDTO,
  PurchaseOrderStatus,
  PurchaseOrderSummaryDTO,
} from "@effy/shared-types";

import { ProductError } from "../products/types";

interface OrderRow {
  id: string;
  reference: string;
  supplier_id: string;
  supplier_name: string;
  status: PurchaseOrderStatus;
  currency: string;
  note: string | null;
  created_at: Date;
  submitted_at: Date | null;
  closed_at: Date | null;
}

interface LineRow {
  id: string;
  product_id: string;
  product_name: string;
  sku: string | null;
  ordered_quantity: number;
  received_quantity: number;
  unit_cost: string | null;
}

/** ⚠ Only a draft may have its lines rewritten. Derived HERE, once, and sent to the client as a flag
 *  so no screen re-derives the rule from `status` and drifts (052's `summarizeFulfillment` lesson). */
function linesEditable(status: PurchaseOrderStatus): boolean {
  return status === "draft";
}

/**
 * ⚠ NULL WHEN ANY LINE HAS NO COST. A total that silently omits the unpriced lines is a wrong number
 * presented as a right one — worse than no number, because an operator will act on it.
 */
function estimatedTotal(lines: LineRow[]): string | null {
  if (lines.length === 0) return "0.00";
  if (lines.some((l) => l.unit_cost === null)) return null;
  const cents = lines.reduce(
    (sum, l) => sum + Math.round(Number(l.unit_cost) * 100) * l.ordered_quantity,
    0,
  );
  return (cents / 100).toFixed(2);
}

function mapLine(row: LineRow): PurchaseOrderLineDTO {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    sku: row.sku,
    orderedQuantity: row.ordered_quantity,
    receivedQuantity: row.received_quantity,
    unitCost: row.unit_cost,
  };
}

const ORDER_COLUMNS = `
  po.id, po.reference, po.supplier_id, s.name AS supplier_name, po.status, po.currency, po.note,
  po.created_at, po.submitted_at, po.closed_at`;

export async function listPurchaseOrders(shopId: string): Promise<PurchaseOrderSummaryDTO[]> {
  const res = await query<OrderRow & { line_count: number; has_unpriced: boolean; total: string | null }>(
    `SELECT ${ORDER_COLUMNS},
            COUNT(l.id)::int AS line_count,
            bool_or(l.unit_cost IS NULL) AS has_unpriced,
            SUM(l.unit_cost * l.ordered_quantity)::text AS total
       FROM public.purchase_order po
       JOIN public.supplier s ON s.id = po.supplier_id
       LEFT JOIN public.purchase_order_line l ON l.purchase_order_id = po.id
      WHERE po.shop_id = $1
      GROUP BY po.id, s.name
      ORDER BY po.created_at DESC`,
    [shopId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    reference: r.reference,
    supplierName: r.supplier_name,
    status: r.status,
    lineCount: r.line_count,
    // ⚠ Same rule as the detail read: unpriced lines make the total unknowable, not zero.
    estimatedTotal: r.has_unpriced || r.total === null ? null : Number(r.total).toFixed(2),
    currency: r.currency,
    createdAt: r.created_at.toISOString(),
    submittedAt: r.submitted_at ? r.submitted_at.toISOString() : null,
  }));
}

export async function getPurchaseOrder(shopId: string, id: string): Promise<PurchaseOrderDTO | null> {
  const head = await query<OrderRow>(
    `SELECT ${ORDER_COLUMNS}
       FROM public.purchase_order po
       JOIN public.supplier s ON s.id = po.supplier_id
      WHERE po.shop_id = $1 AND po.id = $2`,
    [shopId, id],
  );
  const row = head.rows[0];
  if (!row) return null;

  const lines = await query<LineRow>(
    `SELECT l.id, l.product_id, p.name AS product_name, p.sku,
            l.ordered_quantity, l.received_quantity, l.unit_cost::text
       FROM public.purchase_order_line l
       JOIN public.product p ON p.id = l.product_id
      WHERE l.purchase_order_id = $1
      ORDER BY p.name`,
    [id],
  );

  return {
    id: row.id,
    reference: row.reference,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    status: row.status,
    currency: row.currency,
    note: row.note,
    lines: lines.rows.map(mapLine),
    estimatedTotal: estimatedTotal(lines.rows),
    linesEditable: linesEditable(row.status),
    createdAt: row.created_at.toISOString(),
    submittedAt: row.submitted_at ? row.submitted_at.toISOString() : null,
    closedAt: row.closed_at ? row.closed_at.toISOString() : null,
  };
}

export interface CreateLine {
  productId: string;
  orderedQuantity: number;
  unitCost: string | null;
}

/**
 * Create a draft order with its lines, in ONE transaction.
 *
 * ⚠ EVERY PRODUCT IS CHECKED AGAINST THE CALLER'S OWN SHOP INSIDE THE INSERT, not before it. A
 * separate validation read would leave a window in which a product could move shops between the check
 * and the write — and `purchase_order_line.product_id` has no shop column of its own to catch it.
 */
export async function createPurchaseOrder(
  shopId: string,
  createdBySub: string,
  input: { supplierId: string; reference: string; note: string | null; lines: CreateLine[] },
): Promise<string> {
  return withTransaction(async (tx) => {
    const supplier = await tx.query(
      `SELECT 1 FROM public.supplier WHERE id = $1 AND shop_id = $2 AND status = 'active'`,
      [input.supplierId, shopId],
    );
    if ((supplier.rowCount ?? 0) === 0) {
      throw new ProductError("not_found", "supplier not found for this shop");
    }

    let orderId: string;
    try {
      const created = await tx.query<{ id: string }>(
        `INSERT INTO public.purchase_order (shop_id, supplier_id, reference, note, created_by_sub)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [shopId, input.supplierId, input.reference, input.note, createdBySub],
      );
      orderId = created.rows[0]!.id;
    } catch (err) {
      if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
        throw new ProductError("conflict", "a purchase order with that reference already exists");
      }
      throw err;
    }

    for (const line of input.lines) {
      const res = await tx.query(
        `INSERT INTO public.purchase_order_line
           (purchase_order_id, product_id, ordered_quantity, unit_cost)
         SELECT $1, p.id, $3, $4
           FROM public.product p
          WHERE p.id = $2 AND p.shop_id = $5`,
        [orderId, line.productId, line.orderedQuantity, line.unitCost, shopId],
      );
      if ((res.rowCount ?? 0) === 0) {
        throw new ProductError("not_found", "one or more products are not in this shop's catalog");
      }
    }
    return orderId;
  });
}

export async function updateDraft(
  shopId: string,
  id: string,
  patch: { note?: string | null; lines?: CreateLine[] },
): Promise<void> {
  await withTransaction(async (tx) => {
    const head = await tx.query<{ status: PurchaseOrderStatus }>(
      `SELECT status FROM public.purchase_order WHERE shop_id = $1 AND id = $2 FOR UPDATE`,
      [shopId, id],
    );
    const row = head.rows[0];
    if (!row) throw new ProductError("not_found", "purchase order not found");

    // ⚠ Re-checked INSIDE the transaction under FOR UPDATE. Deciding "is this still a draft" outside
    // it lets two operators submit and edit the same order concurrently — 027's rule, applied again.
    if (patch.lines && !linesEditable(row.status)) {
      throw new ProductError("conflict", "this order has been sent to the supplier and can no longer be edited");
    }

    if ("note" in patch) {
      await tx.query(`UPDATE public.purchase_order SET note = $3, updated_at = now()
                       WHERE shop_id = $1 AND id = $2`, [shopId, id, patch.note ?? null]);
    }

    if (patch.lines) {
      await tx.query(`DELETE FROM public.purchase_order_line WHERE purchase_order_id = $1`, [id]);
      for (const line of patch.lines) {
        const res = await tx.query(
          `INSERT INTO public.purchase_order_line
             (purchase_order_id, product_id, ordered_quantity, unit_cost)
           SELECT $1, p.id, $3, $4 FROM public.product p WHERE p.id = $2 AND p.shop_id = $5`,
          [id, line.productId, line.orderedQuantity, line.unitCost, shopId],
        );
        if ((res.rowCount ?? 0) === 0) {
          throw new ProductError("not_found", "one or more products are not in this shop's catalog");
        }
      }
    }
  });
}

export async function setStatus(
  shopId: string,
  id: string,
  to: "submitted" | "cancelled",
): Promise<void> {
  const timestamps =
    to === "submitted"
      ? `status = 'submitted', submitted_at = now()`
      : `status = 'cancelled', closed_at = now(),
         submitted_at = COALESCE(submitted_at, now())`;

  // ⚠ The WHERE clause carries the legal FROM states, so an illegal transition changes 0 rows rather
  // than being decided in the service — the database is where the machine actually lives.
  const legalFrom = to === "submitted" ? ["draft"] : ["draft", "submitted", "partially_received"];

  const res = await query(
    `UPDATE public.purchase_order
        SET ${timestamps}, updated_at = now()
      WHERE shop_id = $1 AND id = $2 AND status = ANY($3::text[])`,
    [shopId, id, legalFrom],
  );
  if ((res.rowCount ?? 0) === 0) {
    throw new ProductError("conflict", "this order is not in a state that allows that change");
  }
}

export interface ReceiveLine {
  lineId: string;
  receivedQuantity: number;
}

/**
 * Receive goods against a purchase order — the one write in this feature that moves stock.
 *
 * ⚠ ABSOLUTE QUANTITIES, NEVER DELTAS. The caller sends the new cumulative total per line, so a
 * double-tap on a shop tablet with a flaky connection books the same pallet once. The DELTA applied to
 * stock is derived here, inside the transaction, from what the row previously held — which is 027's
 * rule and 020's pick-list rule, for the third time.
 *
 * ⚠ AND STOCK ONLY MOVES FOR TRACKED PRODUCTS. An untracked product has no count to increase, and
 * inventing one would make it suddenly limited — 054's whole non-breaking guarantee is that an
 * untracked product behaves exactly as it did before inventory existed.
 */
export async function receive(
  shopId: string,
  id: string,
  actorSub: string,
  lines: ReceiveLine[],
): Promise<void> {
  await withTransaction(async (tx) => {
    const head = await tx.query<{ status: PurchaseOrderStatus }>(
      `SELECT status FROM public.purchase_order WHERE shop_id = $1 AND id = $2 FOR UPDATE`,
      [shopId, id],
    );
    const row = head.rows[0];
    if (!row) throw new ProductError("not_found", "purchase order not found");
    // ⚠ ONLY TWO STATES REFUSE, AND `received` IS DELIBERATELY NOT ONE OF THEM.
    //
    // The first draft of this guard also refused `received`, and the container test caught it twice
    // over. `received` is DERIVED — it is set automatically the moment the last line is fully
    // delivered — so refusing writes in that state broke the two things absolute quantities exist to
    // make safe:
    //
    //   • IDEMPOTENCY. A double-tap on a flaky shop tablet re-sends the same cumulative total. That
    //     must be a no-op, not an error; the operator cannot tell a refusal from a real failure and
    //     will try again.
    //   • CORRECTION. An operator who keyed 24 instead of 4 could never fix it, because their own
    //     mistake had closed the order. A derived state that a human cannot get out of is the same
    //     shape as 056's stranded collection work.
    //
    // Re-deriving the status after every receive means a downward correction reopens the order by
    // itself. `cancelled` DOES refuse, because unlike `received` it is an explicit human decision.
    if (row.status === "draft") {
      throw new ProductError("conflict", "send this order to the supplier before receiving it");
    }
    if (row.status === "cancelled") {
      throw new ProductError("conflict", "this order was cancelled");
    }

    for (const line of lines) {
      const current = await tx.query<{
        product_id: string;
        received_quantity: number;
        stock_tracked: boolean;
        stock_on_hand: number;
      }>(
        `SELECT l.product_id, l.received_quantity, p.stock_tracked, p.stock_on_hand
           FROM public.purchase_order_line l
           JOIN public.product p ON p.id = l.product_id
          WHERE l.id = $1 AND l.purchase_order_id = $2 AND p.shop_id = $3
          FOR UPDATE OF l, p`,
        [line.lineId, id, shopId],
      );
      const before = current.rows[0];
      if (!before) throw new ProductError("not_found", "line not found on this order");

      const delta = line.receivedQuantity - before.received_quantity;
      // ⚠ A no-op and a REDUCTION are both legitimate: an operator correcting a mis-keyed receive must
      // be able to lower the figure, and the stock movement below simply carries a negative delta.
      if (delta === 0) continue;

      await tx.query(
        `UPDATE public.purchase_order_line SET received_quantity = $2, updated_at = now() WHERE id = $1`,
        [line.lineId, line.receivedQuantity],
      );

      if (!before.stock_tracked) continue;

      const after = Math.max(0, before.stock_on_hand + delta);
      await tx.query(`UPDATE public.product SET stock_on_hand = $2, updated_at = now() WHERE id = $1`, [
        before.product_id,
        after,
      ]);
      await tx.query(
        `INSERT INTO public.stock_movement
           (product_id, shop_id, quantity_delta, quantity_before, quantity_after, reason,
            actor_kind, actor_sub, purchase_order_line_id)
         VALUES ($1, $2, $3, $4, $5, 'received', 'shop', $6, $7)`,
        [before.product_id, shopId, delta, before.stock_on_hand, after, actorSub, line.lineId],
      );
    }

    // ⚠ THE RESULTING STATUS IS DERIVED FROM THE LINES, never asserted by the caller. A client that
    // could declare "received" would let one mis-tap close an order with goods still outstanding.
    await tx.query(
      `UPDATE public.purchase_order po
          SET status = CASE
                WHEN NOT EXISTS (SELECT 1 FROM public.purchase_order_line l
                                  WHERE l.purchase_order_id = po.id
                                    AND l.received_quantity < l.ordered_quantity)
                THEN 'received' ELSE 'partially_received' END,
              closed_at = CASE
                WHEN NOT EXISTS (SELECT 1 FROM public.purchase_order_line l
                                  WHERE l.purchase_order_id = po.id
                                    AND l.received_quantity < l.ordered_quantity)
                THEN now() ELSE NULL END,
              updated_at = now()
        WHERE po.id = $1`,
      [id],
    );
  });
}

/** The next per-shop reference, so an operator never has to invent one. */
export async function nextReference(shopId: string): Promise<string> {
  const res = await query<{ n: number }>(
    `SELECT COALESCE(COUNT(*), 0)::int + 1 AS n FROM public.purchase_order WHERE shop_id = $1`,
    [shopId],
  );
  return `PO-${String(res.rows[0]?.n ?? 1).padStart(4, "0")}`;
}
