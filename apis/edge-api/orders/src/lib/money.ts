// The back-office's way into the platform's ONE refund implementation (070).
//
// ⚠ NOTHING ABOUT WHAT A VALID REFUND IS LIVES IN THIS SERVICE. The ceiling, the idempotency key,
// the record-then-submit order and the state machine are `@effy/edge-shared/payments`, which the
// customer's own cancellation and the shop manager's refund call too. This file only builds it.
//
// Module-scope singleton (ARCHITECTURE.md): built once per container, reused across invocations.
import { createRefundRepository, createRefundService, stripeGateway } from "@effy/edge-shared/payments";

export const refundService = createRefundService({ repo: createRefundRepository(), gateway: stripeGateway });
