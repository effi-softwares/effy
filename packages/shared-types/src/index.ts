export * from "./problem";
export * from "./back-office";
export * from "./shop";
export * from "./customer";
export * from "./catalog";
export * from "./product-review";
// 019-customer-commerce-flow
export * from "./storefront";
export * from "./cart";
export * from "./address";
export * from "./delivery-instructions";
export * from "./checkout";
export * from "./order";
// 033-customer-saved-items (replaces the retired ./favorite)
export * from "./saved-item";
// 020-shop-order-fulfillment
export * from "./shop-order";
export * from "./promotion";
export * from "./banner";
// 039-customer-home-redesign
export * from "./newsletter";
// 044-customer-auth-redesign — the shared input-shape rules (extracted from the newsletter service,
// so the storefront refuses exactly what the backend refuses).
export * from "./validation";
// 046-customer-feedback
export * from "./feedback";
// 047-delivery-shipping-engine
export * from "./delivery";
// 077-delivery-fee-engine-v2 — the fee lines and the words every customer surface uses for them
export * from "./delivery-fee";
// 069-delivery-slots-dates — the same-day window and the one wording every surface uses for it
export * from "./delivery-window";
// 078-effy-delivery-windows — the window picker as words, shared with the customer app
export * from "./effy-windows";
// 079-effy-vs-courier-checkout — who delivers an order, and the one wording every surface uses for it
export * from "./delivery-type";
// 073 — where a package is, in nine words, shared by every staff screen.
export * from "./package-status";
export * from "./delivery-admin";
// 049-driver-mobile-app
export * from "./driver";
// 050-observability-push-foundation
export * from "./device";
// 051-customer-payment-experience
export * from "./payment";
// 053-order-lifecycle-completion — back-office order contracts. ⚠ A deliberately separate family
// from ./order: these carry shop identity and the customer's must never learn to (FR-021).
export * from "./order-admin";
// 054-product-inventory
export * from "./inventory";
// 055-refunds-cancellation
export * from "./refund";
// 057-shop-console-redesign
export * from "./shop-team"
// 057 Amendment A3 — the shop order console (separate from the pick contract in ./shop-order)
export * from "./shop-order-console"
// 058-shop-today-insights — Today (live operational) + Insights (prepared analytics)
export * from "./shop-insights"
// 063-driver-work-assignment — rounds, stops, packages and the dispatcher's day. ⚠ Carries no money
// (a driver is never told an order's value) and no coordinates (sequencing is ordering, not geometry).
export * from "./dispatch"
// 071-live-updates — the kinds an update may name, and where an app finds its channel
export * from "./live"
// 074-customer-points — the balance, its history, staff credit/debit, settings, and the payment split
export * from "./points"
