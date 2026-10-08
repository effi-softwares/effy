// @effy/edge-shared/points — the ONE home of points logic (074, research R6).
//
// Four places change a customer's points: back-office credits and debits (`orders`), checkout holds
// and the paid transition (`commerce`, via ../payments/finalize), refunds (../payments/refunds, from
// `commerce`, `orders` and `shop`), and the expiry sweep (`customer`). They all call this module; none
// writes a points table itself (points-append-only.guard.test.ts).
export * from "./errors";
export * from "./vocabulary";
export * from "./split";
export * from "./expiry";
export * from "./settings";
export * from "./ledger";
export * from "./reads";
export * from "./warnings";
export * from "./reconcile";
export * from "./announce";
