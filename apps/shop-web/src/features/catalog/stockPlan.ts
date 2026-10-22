import type { ProductStockDTO } from "@effy/shared-types";

/**
 * The stock table (098) — the pure half: what a number typed against a size MEANS, and what saving it
 * will do. One table for every size of a product, one Save.
 *
 *   receive  — a delivery came in: the number is ADDED to what is on the shelf (reason "received").
 *   count    — a stocktake: the number REPLACES the count (reason "correction").
 *
 * A size that is not counted yet starts counting at the number either way — receiving 24 into an
 * uncounted size and counting it at 24 are the same fact.
 */
export type StockMode = "receive" | "count";

export type RowPlan =
  | { kind: "none" }
  | { kind: "invalid"; message: string }
  | { kind: "adjust"; delta: number; after: number }
  | { kind: "set"; onHand: number; after: number }
  | { kind: "start"; onHand: number; after: number };

const WHOLE = /^\d+$/;

export function planRow(stock: Pick<ProductStockDTO, "tracked" | "onHand">, raw: string, mode: StockMode): RowPlan {
  const text = raw.trim();
  if (text === "") return { kind: "none" };
  if (!WHOLE.test(text)) return { kind: "invalid", message: "a whole number" };
  const n = Number(text);
  if (!stock.tracked) {
    // Receiving nothing into an uncounted size says nothing; counting it at 0 starts the count.
    if (mode === "receive" && n === 0) return { kind: "none" };
    return { kind: "start", onHand: n, after: n };
  }
  const onHand = stock.onHand ?? 0;
  if (mode === "receive") return n === 0 ? { kind: "none" } : { kind: "adjust", delta: n, after: onHand + n };
  return n === onHand ? { kind: "none" } : { kind: "set", onHand: n, after: n };
}

/** Rows that will write something, and whether anything blocks the save. */
export function planTable<T extends { id: string; stock: Pick<ProductStockDTO, "tracked" | "onHand"> }>(
  rows: readonly T[],
  inputs: Readonly<Record<string, string>>,
  mode: StockMode,
): { writes: { row: T; plan: Exclude<RowPlan, { kind: "none" } | { kind: "invalid" }> }[]; invalid: number } {
  const writes: { row: T; plan: Exclude<RowPlan, { kind: "none" } | { kind: "invalid" }> }[] = [];
  let invalid = 0;
  for (const row of rows) {
    const plan = planRow(row.stock, inputs[row.id] ?? "", mode);
    if (plan.kind === "invalid") invalid += 1;
    else if (plan.kind !== "none") writes.push({ row, plan });
  }
  return { writes, invalid };
}
