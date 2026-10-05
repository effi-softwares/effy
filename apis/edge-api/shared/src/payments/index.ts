// @effy/edge-shared/payments — the ONE home of money logic (070 research R3).
//
// Three services move money: `commerce` (checkout, the payment webhook, customer cancellation),
// `orders` (back-office refunds and cancellation) and `shop` (shop-manager refunds). They all call
// this module; none re-implements a refund. It is deliberately NOT re-exported from the library's
// main entry, so only functions that import this path bundle the provider SDK.
export * from "./gateway";
