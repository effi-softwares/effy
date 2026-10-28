/** Shared by both audiences: once an `Actor` exists, the rules are identical. */

import { stockState } from "@effy/edge-shared";
import { announce } from "@effy/edge-shared/live";
import {
  OPERATOR_STOCK_REASONS,
  type ListPage,
  type LowStockRowDTO,
  type ProductStockDTO,
  type ProductStockDetailDTO,
  type OperatorStockReason,
  type StockMovementDTO,
} from "@effy/shared-types";

import { FIRST_MOVEMENTS, type LowStockListRequest, type MovementListRequest } from "./list";
import * as repo from "./repository";
import { notFound, StockError, type Actor, type MovementRow, type StockRow } from "./types";

/** Rejects 2.5, "2", NaN and infinities alike. */
function requireWholeNumber(value: unknown, field: string, { min = 0 }: { min?: number } = {}): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new StockError("validation", "a whole number is required", {
      [field]: "must be a whole number",
    });
  }
  if (value < min) {
    throw new StockError("validation", "the value is out of range", {
      [field]: `must be ${min} or more`,
    });
  }
  // Beyond this is a typo or an attack on the audit trail.
  if (value > 1_000_000) {
    throw new StockError("validation", "the value is out of range", {
      [field]: "must be 1,000,000 or fewer",
    });
  }
  return value;
}

function requireReason(value: unknown): OperatorStockReason {
  if (typeof value !== "string" || !(OPERATOR_STOCK_REASONS as readonly string[]).includes(value)) {
    throw new StockError("validation", "a reason is required", {
      reason: `must be one of: ${OPERATOR_STOCK_REASONS.join(", ")}`,
    });
  }
  return value as OperatorStockReason;
}

function optionalNote(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 500) {
    throw new StockError("validation", "the note is not usable", {
      note: "must be text of 500 characters or fewer",
    });
  }
  return value;
}

/** The shared mapping, so "low" means one thing. */
export function toStockDTO(row: StockRow): ProductStockDTO {
  return stockState({
    productId: row.productId, variantId: row.variantId, tracked: row.tracked, onHand: row.onHand,
    threshold: row.threshold, shopDefaultThreshold: row.shopDefaultThreshold,
  });
}

function toMovementDTO(m: MovementRow): StockMovementDTO {
  return { ...m };
}

/** The variant's stock and the first page of its movements (the same page `?movements=page` starts with). */
export async function getStock(
  actor: Actor,
  variantId: string,
  req: MovementListRequest = FIRST_MOVEMENTS,
): Promise<ProductStockDetailDTO> {
  const row = await repo.readStock(variantId, actor.shopId);
  if (!row) throw notFound();
  const page = await repo.readMovementPage(variantId, { ...req, cursor: null });
  return { stock: toStockDTO(row), movements: page.items.map(toMovementDTO) };
}

/** One page of the variant's movements, newest first (103): `?movements=page`. */
export async function getMovementPage(
  actor: Actor,
  variantId: string,
  req: MovementListRequest,
): Promise<ListPage<StockMovementDTO>> {
  const row = await repo.readStock(variantId, actor.shopId);
  if (!row) throw notFound();
  const page = await repo.readMovementPage(variantId, req);
  return { ...page, items: page.items.map(toMovementDTO) };
}

export async function listLowStock(actor: Actor, req: LowStockListRequest): Promise<ListPage<LowStockRowDTO>> {
  return repo.readLowStock(actor.shopId, req);
}

export async function getSettings(actor: Actor) {
  return { defaultThreshold: await repo.readSettings(actor.shopId) };
}

/** Announced after commit to the shop whose stock it is, whoever changed it. */
const stockChanged = (actor: Actor) => announce([{ scope: "shop", shopId: actor.shopId, kind: "stock" }]);

/** Enabling requires a count. */
export async function setTracking(
  actor: Actor,
  variantId: string,
  body: Record<string, unknown>,
): Promise<ProductStockDetailDTO> {
  if (typeof body.tracked !== "boolean") {
    throw new StockError("validation", "tracked is required", { tracked: "must be true or false" });
  }
  let onHand: number | null = null;
  if (body.tracked) {
    if (body.onHand === undefined || body.onHand === null) {
      // Refused rather than defaulted to zero, which would make the product unbuyable unasked.
      throw new StockError("validation", "a count is required to turn tracking on", {
        onHand: "required when enabling tracking",
      });
    }
    onHand = requireWholeNumber(body.onHand, "onHand");
  }
  await repo.setTracking(actor, variantId, body.tracked, onHand);
  await stockChanged(actor);
  return getStock(actor, variantId);
}

export async function setCount(
  actor: Actor,
  variantId: string,
  body: Record<string, unknown>,
): Promise<ProductStockDetailDTO> {
  const onHand = requireWholeNumber(body.onHand, "onHand");
  const reason = requireReason(body.reason);
  await requireTracked(actor, variantId);
  await repo.setCount(actor, variantId, onHand, reason, optionalNote(body.note));
  await stockChanged(actor);
  return getStock(actor, variantId);
}

export async function adjustCount(
  actor: Actor,
  variantId: string,
  body: Record<string, unknown>,
): Promise<ProductStockDetailDTO> {
  if (typeof body.delta !== "number" || !Number.isInteger(body.delta)) {
    throw new StockError("validation", "a whole number is required", {
      delta: "must be a whole number",
    });
  }
  if (body.delta === 0) {
    // A movement that moves nothing would dilute the history.
    throw new StockError("validation", "the change is empty", { delta: "must not be zero" });
  }
  const reason = requireReason(body.reason);
  await requireTracked(actor, variantId);
  await repo.adjustCount(actor, variantId, body.delta, reason, optionalNote(body.note));
  await stockChanged(actor);
  return getStock(actor, variantId);
}

export async function setThreshold(
  actor: Actor,
  variantId: string,
  body: Record<string, unknown>,
): Promise<ProductStockDetailDTO> {
  const threshold =
    body.threshold === null || body.threshold === undefined
      ? null
      : requireWholeNumber(body.threshold, "threshold");
  await repo.setThreshold(actor, variantId, threshold);
  await stockChanged(actor);
  return getStock(actor, variantId);
}

export async function setSettings(actor: Actor, body: Record<string, unknown>) {
  const value =
    body.defaultThreshold === null || body.defaultThreshold === undefined
      ? null
      : requireWholeNumber(body.defaultThreshold, "defaultThreshold");
  await repo.writeSettings(actor.shopId, value, actor.sub);
  await stockChanged(actor);
  return { defaultThreshold: value };
}

/** A conflict, not a validation error: the database's refusal would read as "no such product". */
async function requireTracked(actor: Actor, variantId: string): Promise<StockRow> {
  const row = await repo.readStock(variantId, actor.shopId);
  if (!row) throw notFound();
  if (!row.tracked) {
    throw new StockError("conflict", "stock is not being tracked for this product");
  }
  return row;
}

export type { LowStockRowDTO };
