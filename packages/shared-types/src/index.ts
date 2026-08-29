export * from "./problem";
export * from "./back-office";
export * from "./shop";
export * from "./customer";
export * from "./catalog";
// 019-customer-commerce-flow
export * from "./storefront";
export * from "./cart";
export * from "./address";
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
