// @effy/edge-shared/payments — the ONE home of money logic (070 research R3).
//
// Three services move money: `commerce` (checkout, the payment webhook, customer cancellation),
// `orders` (back-office refunds and cancellation) and `shop` (shop-manager refunds). They all call
// this module; none re-implements a refund. It is deliberately NOT re-exported from the library's
// main entry, so only functions that import this path bundle the provider SDK.
/**
 * ⚠ MONEY METRICS HAVE ONE NAMESPACE, WHICHEVER SERVICE MOVED THE MONEY. A refund issued from the
 * back office and one issued from a shop console are the same event to whoever is paged about a
 * failing refund. If each service emitted under its own namespace, the alarm would watch one of
 * three and the other two would fail silently — so this is a constant, not the caller's setting.
 */
export const MONEY_METRIC_NAMESPACE = "Effy/Commerce";

export * from "./gateway";
export * from "./outbox";
export * from "./finalize";
export * from "./refunds";
