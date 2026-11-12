import { announce, type AnnounceDeps } from "../live/announce";
import { emitMetric } from "../lib/metrics";
import { MONEY_METRIC_NAMESPACE } from "../payments/index";

/**
 * 114: after the transaction that held, released or used stock COMMITS, tell each shop whose numbers moved and
 * back-office (`stock`, the kind only - nothing about the shopper). Never throws, like `announce`.
 */
export async function announceStockChange(shopIds: readonly string[], deps?: AnnounceDeps): Promise<void> {
  const unique = [...new Set(shopIds)];
  if (unique.length === 0) return;
  await announce([...unique.map((shopId) => ({ scope: "shop" as const, shopId, kind: "stock" as const })), { scope: "ops", kind: "stock" }], deps);
}

/** How a hold ended, for staff (FR-021). One namespace whichever service ended it, so one alarm sees them all. */
export type StockHoldEnd = "paid" | "abandoned" | "failed" | "replaced" | "refused";

export function meterStockHoldsEnded(reason: StockHoldEnd, counts: { live: number; lapsed: number }): void {
  if (counts.live > 0) emitMetric(MONEY_METRIC_NAMESPACE, "StockHoldsEnded", counts.live, { reason, lapsed: "no" });
  if (counts.lapsed > 0) emitMetric(MONEY_METRIC_NAMESPACE, "StockHoldsEnded", counts.lapsed, { reason, lapsed: "yes" });
}

/** A payment start's hold outcome. */
export function meterStockHold(outcome: "held" | "refused_shown" | "refused_locked"): void {
  emitMetric(MONEY_METRIC_NAMESPACE, "StockHolds", 1, { outcome });
}
