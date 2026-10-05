// Module-scope wiring (cached singleton pattern — ARCHITECTURE.md): built once per container and
// reused across warm invocations. No DI framework; the graph is this file, top to bottom.
import { pooled } from "@effy/edge-shared";
import { createRefundRepository, createRefundService, stripeGateway } from "@effy/edge-shared/payments";
import { loadCartPolicy } from "@effy/edge-shared/cart-policy";

import { createCartRepository } from "../cart/repository";
import { createCartService } from "../cart/service";
import { defaultQuoter } from "../checkout/quote";
import { createCheckoutService } from "../checkout/service";
import { createCheckoutStore } from "../checkout/store";
import { createOrdersRepository } from "../orders/repository";
import { createOrdersService } from "../orders/service";
import { createSavedRepository } from "../saved/repository";
import { createSavedService } from "../saved/service";
import { createWebhookHandler } from "../webhook/handler";

/** The order rules, read fresh on each use: a change in back-office must apply to the next cart. */
export const cartPolicy = () => loadCartPolicy(pooled);

export const cartService = createCartService({ repo: createCartRepository(), policy: cartPolicy });

// Bulk add-to-cart calls the cart in-process: one rule for what may enter a cart, not two.
export const savedService = createSavedService({
  repo: createSavedRepository(),
  addToCart: (customerId, productId, changeId, quantity) => cartService.add(customerId, productId, changeId, quantity),
});

export const checkoutStore = createCheckoutStore();
export const deliveryQuoter = defaultQuoter();

export const checkoutService = createCheckoutService({
  store: checkoutStore,
  gateway: stripeGateway,
  policy: cartPolicy,
  // The SAME rule the cart read applies, with usage counted: the cart and the charge cannot disagree.
  promos: (customerId, payableCents) => cartService.discountForCustomer(customerId, payableCents),
  quoter: deliveryQuoter,
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? "",
});

// Refunds, cancellation and refund requests. The rules are the shared module's; this service only
// exposes the customer's own routes into them, the provider's reports, and the reconciler.
export const refundService = createRefundService({ repo: createRefundRepository(), gateway: stripeGateway });

export const handleWebhook = createWebhookHandler({
  gateway: stripeGateway,
  // Applied on the webhook's own transaction, so the event is recorded only if this succeeded.
  refunds: async (tx, evt) => {
    await refundService.handleRefundEvent(tx, evt);
  },
  afterPaid: (scope, orderId, intentId) => checkoutService.capturePaymentMethod(scope, orderId, intentId),
});

export const ordersService = createOrdersService({ repo: createOrdersRepository() });
