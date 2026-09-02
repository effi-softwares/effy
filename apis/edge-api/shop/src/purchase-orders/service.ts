// Service for purchase orders (057, US6): validation + orchestration. No HTTP, no SQL.
import type {
  PurchaseOrderDTO,
  PurchaseOrderSummaryDTO,
  ReceivePurchaseOrderLine,
} from "@effy/shared-types";

import { ProductError } from "../products/types";
import * as repo from "./repository";

function invalid(field: string, message: string): never {
  throw new ProductError("validation", "invalid purchase order", [{ field, message }]);
}

/** ⚠ A quantity must be a positive INTEGER. `2.5` cases of eggs is not a thing, and a float here
 *  would be silently truncated by the int column — the operator would never learn what was ordered. */
function quantity(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    invalid(field, "must be a whole number greater than zero");
  }
  return value;
}

/** Money crosses as a 2-dp decimal STRING, never a float (019/047). */
function optionalCost(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  const text = typeof value === "number" ? value.toFixed(2) : String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) invalid(field, "must be an amount like 12.50");
  return Number(text).toFixed(2);
}

function parseLines(raw: unknown): repo.CreateLine[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    invalid("lines", "at least one line is required");
  }
  const seen = new Set<string>();
  return raw.map((entry, i) => {
    const line = entry as Record<string, unknown>;
    const productId = typeof line.productId === "string" ? line.productId.trim() : "";
    if (!productId) invalid(`lines[${i}].productId`, "is required");
    // ⚠ Caught HERE rather than left to the UNIQUE constraint: the database refusal names a
    // constraint, and an operator reading "purchase_order_line_product_uq" learns nothing.
    if (seen.has(productId)) invalid(`lines[${i}].productId`, "appears twice — combine the quantities");
    seen.add(productId);
    return {
      productId,
      orderedQuantity: quantity(line.orderedQuantity, `lines[${i}].orderedQuantity`),
      unitCost: optionalCost(line.unitCost, `lines[${i}].unitCost`),
    };
  });
}

export function listPurchaseOrders(shopId: string): Promise<PurchaseOrderSummaryDTO[]> {
  return repo.listPurchaseOrders(shopId);
}

export async function getPurchaseOrder(shopId: string, id: string): Promise<PurchaseOrderDTO> {
  const found = await repo.getPurchaseOrder(shopId, id);
  if (!found) throw new ProductError("not_found", "purchase order not found");
  return found;
}

export async function createPurchaseOrder(
  shopId: string,
  createdBySub: string,
  body: Record<string, unknown>,
): Promise<PurchaseOrderDTO> {
  const supplierId = typeof body.supplierId === "string" ? body.supplierId.trim() : "";
  if (!supplierId) invalid("supplierId", "is required");

  const reference =
    typeof body.reference === "string" && body.reference.trim()
      ? body.reference.trim()
      : await repo.nextReference(shopId);

  const id = await repo.createPurchaseOrder(shopId, createdBySub, {
    supplierId,
    reference,
    note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
    lines: parseLines(body.lines),
  });
  return getPurchaseOrder(shopId, id);
}

export async function updatePurchaseOrder(
  shopId: string,
  id: string,
  body: Record<string, unknown>,
): Promise<PurchaseOrderDTO> {
  if ("status" in body) {
    const to = body.status;
    if (to !== "submitted" && to !== "cancelled") {
      // ⚠ `received` is deliberately NOT requestable. It is DERIVED from the lines when goods arrive;
      // a client that could assert it would close an order with stock still outstanding.
      invalid("status", "must be submitted or cancelled — receiving is done through /receive");
    }
    await repo.setStatus(shopId, id, to);
  }

  const patch: { note?: string | null; lines?: repo.CreateLine[] } = {};
  if ("note" in body) {
    patch.note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  }
  if ("lines" in body) patch.lines = parseLines(body.lines);
  if (Object.keys(patch).length > 0) await repo.updateDraft(shopId, id, patch);

  return getPurchaseOrder(shopId, id);
}

export async function receivePurchaseOrder(
  shopId: string,
  id: string,
  actorSub: string,
  body: Record<string, unknown>,
): Promise<PurchaseOrderDTO> {
  const raw = body.lines;
  if (!Array.isArray(raw) || raw.length === 0) invalid("lines", "at least one line is required");

  const lines: ReceivePurchaseOrderLine[] = raw.map((entry, i) => {
    const line = entry as Record<string, unknown>;
    const lineId = typeof line.lineId === "string" ? line.lineId.trim() : "";
    if (!lineId) invalid(`lines[${i}].lineId`, "is required");
    const received = line.receivedQuantity;
    // ⚠ ZERO IS LEGAL, unlike an ordered quantity: it is how an operator corrects a receive they
    // booked by mistake. Only a negative or fractional figure is refused.
    if (typeof received !== "number" || !Number.isInteger(received) || received < 0) {
      invalid(`lines[${i}].receivedQuantity`, "must be a whole number of zero or more");
    }
    return { lineId, receivedQuantity: received };
  });

  await repo.receive(shopId, id, actorSub, lines);
  return getPurchaseOrder(shopId, id);
}
