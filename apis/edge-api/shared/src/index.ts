// @effy/edge-shared — the cross-cutting edge library + contracts, single source of truth for
// every cold-path service (constitution Principle II). No domain logic here.
export * from "./lib/db";
export * from "./lib/secrets";
export * from "./lib/logger";
export * from "./lib/http";
export * from "./lib/health";
export * from "./lib/claims";
export * from "./lib/rds-ca";
export * from "./lib/password";
export * from "./lib/media";
export * from "./lib/image-dimensions";
// 050: device push-token registration, shared by every service that registers a mobile device.
export * from "./lib/devices";
// 053: back-office authz (record-authoritative), promoted from admin/feedback when edge-orders
// became its third consumer. Principle II — cross-cutting logic is shared, never copy-pasted.
export * from "./lib/back-office-authz";
// 053: "is this order finished, and if so tell the customer" — one rule, called by both the driver
// service (a same-day drop) and the orders service (a carrier arrival).
export * from "./lib/order-completion";
// 032: promoted from edge-api/admin so the shop console shares ONE definition of "a real place".
export * from "./validate";
