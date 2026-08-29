/**
 * Stock legality and validation (054). No HTTP, no SQL — the repository owns scoping, this owns
 * what is allowed to happen (Principle VI).
 *
 * ⚠ THIS FILE IS SHARED BY BOTH AUDIENCES. The shop path and the back-office assisted path differ
 * ONLY in how the actor is resolved and gated; once an `Actor` exists, the rules are identical. That
 * is deliberate (research R6): two copies of "what a valid stock change is" would drift, and the
 * drift would show up as back-office being able to write something a shop cannot, or vice versa.
 */

import {
  OPERATOR_STOCK_REASONS,
  type LowStockRowDTO,
  type ProductStockDTO,
  type ProductStockDetailDTO,
  type OperatorStockReason,
  type StockMovementDTO,
} from "@effy/shared-types";

import * as repo from "./repository";
import { effectiveThreshold, notFound, StockError, type Actor, type MovementRow, type StockRow } from "./types";

// ── Validation ──────────────────────────────────────────────────────────────────────────────────

/**
 * ⚠ `Number.isInteger` REJECTS 2.5 AND "2" ALIKE, which is what we want: JSON gives us `unknown`, and
 * a string that happens to look like a number must not become a count. `isInteger` is also false for
 * NaN and both infinities, so no separate guard is needed for those.
 */
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
  // A count beyond this is not a shop counting a shelf, it is a typo or an attack on the audit trail.
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

// ── Mapping ─────────────────────────────────────────────────────────────────────────────────────

export function toStockDTO(row: StockRow): ProductStockDTO {
  const threshold = effectiveThreshold(row);
  const onHand = row.tracked ? (row.onHand ?? 0) : null;
  return {
    productId: row.productId,
    tracked: row.tracked,
    onHand,
    threshold: row.threshold,
    effectiveThreshold: threshold,
    outOfStock: row.tracked && onHand === 0,
    // ⚠ `low` EXCLUDES zero on purpose. An empty shelf and a thin one need different actions —
    // restock now versus restock soon — and a row that claimed both would sort into two places.
    low: row.tracked && threshold !== null && onHand !== null && onHand > 0 && onHand <= threshold,
  };
}

function toMovementDTO(m: MovementRow): StockMovementDTO {
  return { ...m };
}

// ── Reads ───────────────────────────────────────────────────────────────────────────────────────

export async function getStock(actor: Actor, productId: string): Promise<ProductStockDetailDTO> {
  const row = await repo.readStock(productId, actor.shopId);
  if (!row) throw notFound();
  return {
    stock: toStockDTO(row),
    movements: (await repo.readMovements(productId)).map(toMovementDTO),
  };
}

/** The restock list for the actor's shop (FR-029). */
export async function listLowStock(actor: Actor): Promise<LowStockRowDTO[]> {
  return repo.readLowStock(actor.shopId);
}

export async function getSettings(actor: Actor) {
  return { defaultThreshold: await repo.readSettings(actor.shopId) };
}

// ── Writes ──────────────────────────────────────────────────────────────────────────────────────

/** Turn tracking on or off. Enabling REQUIRES a count — FR-003, and the database agrees. */
export async function setTracking(
  actor: Actor,
  productId: string,
  body: Record<string, unknown>,
): Promise<ProductStockDetailDTO> {
  if (typeof body.tracked !== "boolean") {
    throw new StockError("validation", "tracked is required", { tracked: "must be true or false" });
  }
  let onHand: number | null = null;
  if (body.tracked) {
    if (body.onHand === undefined || body.onHand === null) {
      // ⚠ Refused rather than defaulted to zero. Defaulting would make the product instantly
      // unbuyable with no operator intent behind it — a state the shop would learn about from a
      // customer rather than from their own action.
      throw new StockError("validation", "a count is required to turn tracking on", {
        onHand: "required when enabling tracking",
      });
    }
    onHand = requireWholeNumber(body.onHand, "onHand");
  }
  await repo.setTracking(actor, productId, body.tracked, onHand);
  return getStock(actor, productId);
}

export async function setCount(
  actor: Actor,
  productId: string,
  body: Record<string, unknown>,
): Promise<ProductStockDetailDTO> {
  const onHand = requireWholeNumber(body.onHand, "onHand");
  const reason = requireReason(body.reason);
  await requireTracked(actor, productId);
  await repo.setCount(actor, productId, onHand, reason, optionalNote(body.note));
  return getStock(actor, productId);
}

export async function adjustCount(
  actor: Actor,
  productId: string,
  body: Record<string, unknown>,
): Promise<ProductStockDetailDTO> {
  if (typeof body.delta !== "number" || !Number.isInteger(body.delta)) {
    throw new StockError("validation", "a whole number is required", {
      delta: "must be a whole number",
    });
  }
  if (body.delta === 0) {
    // A movement that moves nothing is a record with no fact behind it, and it would dilute the
    // history the shop reads to understand what happened.
    throw new StockError("validation", "the change is empty", { delta: "must not be zero" });
  }
  const reason = requireReason(body.reason);
  await requireTracked(actor, productId);
  await repo.adjustCount(actor, productId, body.delta, reason, optionalNote(body.note));
  return getStock(actor, productId);
}

export async function setThreshold(
  actor: Actor,
  productId: string,
  body: Record<string, unknown>,
): Promise<ProductStockDetailDTO> {
  const threshold =
    body.threshold === null || body.threshold === undefined
      ? null
      : requireWholeNumber(body.threshold, "threshold");
  await repo.setThreshold(actor, productId, threshold);
  return getStock(actor, productId);
}

export async function setSettings(actor: Actor, body: Record<string, unknown>) {
  const value =
    body.defaultThreshold === null || body.defaultThreshold === undefined
      ? null
      : requireWholeNumber(body.defaultThreshold, "defaultThreshold");
  await repo.writeSettings(actor.shopId, value, actor.sub);
  return { defaultThreshold: value };
}

/**
 * ⚠ Moving a count on an UNTRACKED product is a conflict, not a validation error, and not a silent
 * success. The database would refuse it anyway (the write matches no row), but that refusal is
 * indistinguishable from "no such product" and would tell the operator the wrong thing entirely.
 */
async function requireTracked(actor: Actor, productId: string): Promise<StockRow> {
  const row = await repo.readStock(productId, actor.shopId);
  if (!row) throw notFound();
  if (!row.tracked) {
    throw new StockError("conflict", "stock is not being tracked for this product");
  }
  return row;
}

export type { LowStockRowDTO };
