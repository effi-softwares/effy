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
export * from "./lib/notification-types";
// 053: back-office authz (record-authoritative), promoted from admin/feedback when edge-orders
// became its third consumer. Principle II — cross-cutting logic is shared, never copy-pasted.
export * from "./lib/back-office-authz";
// 053: "is this order finished, and if so tell the customer" — one rule, called by both the driver
// service (a same-day drop) and the orders service (a carrier arrival).
export * from "./lib/order-completion";
// 032: promoted from edge-api/admin so the shop console shares ONE definition of "a real place".
export * from "./validate";
// 058: proposed refunds — derived, never stored (055). Promoted when the shop console became its
// second reader: back-office decides them per order, the shop console surfaces its own on Today.
export * from "./lib/refund-proposals";
// 058: the low-stock rule, promoted from edge-api/inventory when Today became its third reader.
// One rule in one place — 054's "availability written in 14 places" lesson, applied before it bites.
export * from "./lib/low-stock";
// 062: what a driver covers — one rule, read by back-office (to staff a zone) and by the driver app
// (the driver's own account screen). Promoted from edge-api/fleet on its second consumer.
export * from "./lib/driver-coverage";
// 063: what a driver does next — ONE ordering rule, read by the dispatcher console (edge-fleet) and
// the driver app (edge-driver). Two surfaces rendering one round in two orders is a divergence in
// which nothing fails, so the rule is shared before a second copy can exist.
export * from "./lib/round-ordering";
// 063: when collection must be finished. ⚠ A DELIBERATE DUPLICATE of core-api's SameDayCutoff — the
// runtimes cannot share code — pinned by a cross-language contract test with DST fixtures.
export * from "./lib/collection-deadline";
// 064: the S3 prefix delivery proof is written under. ⚠ Shared because the Terraform lifecycle rule
// that archives proof is scoped to it — a disagreement archives the product catalogue or nothing,
// and neither raises an error anywhere.
export * from "./lib/proof-prefix";
// 064: load the REAL migrations into a container test. Promoted from edge-fleet on its second
// consumer — a transcribed schema that drifts is worse than no container test, because it looks
// like proof.
export * from "./lib/load-migrations";
// 064: who is holding a package. Shared because the dispatcher's custody view and the driver's
// duty-end check must never disagree about whether a van still has goods in it.
export * from "./lib/custody";
// 063: may this driver do this work. Read by the wave planner (to choose) and by the dispatcher's
// reassign route (to refuse). If they disagreed, a dispatcher could do what the planner would not.
export * from "./lib/driver-eligibility";
