import { pooled } from "@effy/edge-shared";
import { createRefundRepository, createRefundService, stripeGateway } from "@effy/edge-shared/payments";
import { loadCartPolicy } from "@effy/edge-shared/cart-policy";

import { createCartRepository } from "../cart/repository";
import { createCartService } from "../cart/service";
import { defaultQuoter, type PromoSource } from "../checkout/quote";
import { createCheckoutService } from "../checkout/service";
import { createCheckoutStore } from "../checkout/store";
import { createOrdersRepository } from "../orders/repository";
import { pricePromotionsFor } from "../promotions/pricing";
import { createOrdersService } from "../orders/service";
import { createSavedRepository } from "../saved/repository";
import { createSavedService } from "../saved/service";
import { createWebhookHandler } from "../webhook/handler";

/** Read fresh on each use, so a back-office change applies to the next cart. */
export const cartPolicy = () => loadCartPolicy(pooled);

export const cartService = createCartService({ repo: createCartRepository(), policy: cartPolicy });

export const savedService = createSavedService({
  repo: createSavedRepository(),
  addToCart: (customerId, variantId, changeId, quantity) => cartService.add(customerId, variantId, changeId, quantity),
});

export const checkoutStore = createCheckoutStore();
export const deliveryQuoter = defaultQuoter();

// The same engine the cart prices with, so the cart and the charge cannot disagree.
const promos: PromoSource = async ({ customerId, lines, deliveryType, deliveryFeeCents, now, excludeOrderId }) =>
  pricePromotionsFor(pooled, {
    customerId,
    enteredCodeId: await cartService.enteredCodeFor(customerId),
    lines: lines.map((l) => ({ variantId: l.variantId, productId: l.productId, unitCents: l.unitCents, quantity: l.quantity })),
    deliveryType,
    deliveryFeeCents,
    now,
    excludeOrderId: excludeOrderId ?? null,
  });

/** Takes the promotion too: free delivery and the small-order fee are judged on the discounted basket. */
export const quoteDeps = { store: checkoutStore, quoter: deliveryQuoter, promos };

export const checkoutService = createCheckoutService({
  store: checkoutStore,
  gateway: stripeGateway,
  policy: cartPolicy,
  promos,
  quoter: deliveryQuoter,
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? "",
});

export const refundService = createRefundService({ repo: createRefundRepository(), gateway: stripeGateway });

export const handleWebhook = createWebhookHandler({
  gateway: stripeGateway,
  // On the webhook's transaction, so the event is recorded only if this succeeds.
  refunds: async (tx, evt) => {
    await refundService.handleRefundEvent(tx, evt);
  },
  afterPaid: (scope, orderId, intentId) => checkoutService.capturePaymentMethod(scope, orderId, intentId),
});

export const ordersService = createOrdersService({ repo: createOrdersRepository() });
