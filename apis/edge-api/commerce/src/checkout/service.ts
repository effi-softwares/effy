// The amount is decided here and nowhere else: catalogue prices, promotions re-evaluated now, the
// delivery engine's fee. No figure a client sends is used.
import { PromotionsChangedError } from "@effy/edge-shared/promotions";
import {
  CURRENCY, emitMetric, formatCents, metricNamespace, operatingStamp, parseCents, withTransaction, type RequestScope, type Transactor,
} from "@effy/edge-shared";
import { meetsMinimum, remainingToMinimum, type CartPolicy } from "@effy/edge-shared/cart-policy";
import {
  basketValueCents, CourierNotPurchasableError, feeDTO, ListedPostcodeUnpricedError, NoActivePlanError,
  storedBreakdown, type PricedFee, type QuoteResult,
} from "@effy/edge-shared/delivery";
import {
  announcePaid, finalizeFailed, finalizeSucceeded, meterFinalize,
  type FinalizeOutcome, type IntentStatus, type PaymentGateway,
} from "@effy/edge-shared/payments";
import type { DeliveryInstructionsDTO } from "@effy/shared-types";
import { createHash } from "node:crypto";

import { isUuid } from "../lib/ids";
import {
  DeliveryChoiceError, resolveCourier, resolveEffyChoice, type ChosenWindow,
} from "./delivery-choice";
import {
  AddressNotFoundError, CARD_MINIMUM_CENTS, destinationPostcode, packagesFromLines, type DeliveryQuoter,
  type PromoSource,
} from "./quote";
import { SlotUnavailableError, type CheckoutStore, type PackageDelivery, type SlotHold, type SoldDelivery } from "./store";

export { AddressNotFoundError };

export class EmptyCartError extends Error {}
/** While tax invoices are on, a product with no GST class is not sold; the customer sees only "unavailable". */
export class NotServiceableError extends Error {}
export class OrderNotFoundError extends Error {}
/** "No such card" and "not yours" alike, so the route reveals nothing about card ids. */
export class PaymentMethodNotFoundError extends Error {}

/** Carries the most points that can be used, so the client can offer it. */
export class PointsExceedTotalError extends Error {
  constructor(readonly maxPoints: number) {
    super("checkout: more points than the order total");
  }
}
export class PointsCardRemainderTooSmallError extends Error {
  constructor(readonly maxPoints: number) {
    super("checkout: the card would be left less than the provider can charge");
  }
}
/** A provider payment is already in flight, so the order cannot switch to points only. */
export class PaymentInProgressError extends Error {}

export { CARD_MINIMUM_CENTS };

export class BelowMinimumError extends Error {
  constructor(readonly minimumCents: number, readonly remainingCents: number) {
    super("checkout: order below the minimum");
  }
}

export interface IntentInput {
  addressId: string;
  /** Empty, or equal to `addressId`, means billing same as shipping. */
  billingAddressId: string;
  /** Required when Effy delivers; a courier order has none. */
  deliveryWindow?: ChosenWindow | null;
  /** The type the client is showing; a mismatch is refused before anything is written. */
  deliveryType?: "effy" | "courier" | null;
  /** Sent instead of a window. */
  deliveryPromise?: "asap" | null;
  /** Already validated and normalised. */
  deliveryInstructions: DeliveryInstructionsDTO;
  /** Set only by a client that renders a provider-owned payment-method list (mobile). */
  wantsProviderMethodList: boolean;
  pointsToUse: number;
  /** The delivery total the client shows, as a 2-dp amount; "" when none was sent. */
  shownDeliveryAmount: string;
  /** The promotions total (goods + delivery) the client shows; "" when none was sent. */
  expectedDiscount?: string;
}

export type { PromoSource };

/** The promotions total differs from what the client showed; nothing was taken. */
export class PromotionsChangedRefusal extends Error {
  constructor(readonly shownCents: number | null, readonly nowCents: number | null) {
    super(`checkout: promotions changed (shown ${shownCents}, now ${nowCents})`);
  }
}

/** The delivery total differs from what the client showed; nothing was written. */
export class DeliveryFeeChangedError extends Error {
  constructor(readonly shownCents: number, readonly nowCents: number) {
    super(`checkout: delivery fee changed (shown ${shownCents}, now ${nowCents})`);
  }
}

const PAY_OVER_TIME = new Set(["klarna", "zip", "afterpay_clearpay"]);

/**
 * Deterministic over the order, the amount and the provider customer, so a retry returns the same
 * intent and a changed basket gets a new one.
 */
export function idempotencyKey(orderId: string, amountCents: number, providerCustomerId: string): string {
  return createHash("sha256").update(`pi:${orderId}:${amountCents}:${providerCustomerId}`).digest("hex");
}

export function paymentStatusFor(s: IntentStatus): string {
  return s === "succeeded" || s === "requires_action" || s === "canceled" || s === "failed" ? s : "requires_payment";
}

function deliveryOutcome(q: QuoteResult): string {
  if (!q.serviced) return "unserviced";
  // Effy does not deliver there, or has no window left.
  if (q.coverage === "courier") return q.reason === "no_window" ? "courier_fallback" : "courier";
  return q.effyWindows.unavailable ?? "windows_offered";
}

/** Billing details for confirmation, derived from the order's address snapshot. */
export function billingDetailsFrom(snapshot: Record<string, unknown> | null, name: string, email: string) {
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const out = { name, email, address: { line1: "", line2: "", city: "", state: "", postalCode: "", country: "AU" } };
  if (!snapshot) return out;
  out.address = {
    line1: text(snapshot.line1), line2: text(snapshot.line2), city: text(snapshot.city),
    state: text(snapshot.region), postalCode: text(snapshot.postalCode),
    country: text(snapshot.country) || "AU",
  };
  // The order's recipient: a profile name may be empty after code or federated sign-in.
  if (text(snapshot.recipientName) !== "") out.name = text(snapshot.recipientName);
  return out;
}

/** A card is good through its expiry month. */
export function cardExpired(expMonth: number, expYear: number, now: Date): boolean {
  const y = now.getUTCFullYear();
  if (expYear !== y) return expYear < y;
  return expMonth < now.getUTCMonth() + 1;
}

export function createCheckoutService(deps: {
  store: CheckoutStore;
  gateway: PaymentGateway;
  policy: () => Promise<CartPolicy>;
  promos: PromoSource;
  quoter: DeliveryQuoter;
  publishableKey: string;
  transact?: Transactor;
}) {
  const { store, gateway } = deps;
  const transact = deps.transact ?? withTransaction;
  const ns = () => metricNamespace();

  async function settlePaid(orderId: string): Promise<FinalizeOutcome> {
    const out = await transact((tx) => finalizeSucceeded(tx, orderId));
    meterFinalize(ns(), out);
    await announcePaid(out);
    return out;
  }

  /**
   * Records how the order was paid, after the commit and best-effort: a provider read inside the
   * payment transaction would hold its locks across a network call.
   */
  async function capturePaymentMethod(scope: Pick<RequestScope, "log">, orderId: string, intentId: string): Promise<void> {
    if (intentId === "") return;
    try {
      const m = await gateway.describePaymentMethod(intentId);
      if (m.type !== "") await store.savePaymentMethod(orderId, m);
    } catch (err) {
      scope.log.warn({ err, orderId }, "checkout: payment method not captured");
    }
  }

  /**
   * Recycles the open order only while its payment attempt is live: reusing one whose intent settled
   * would tie a second basket to the first payment. Only the provider knows, so it is asked.
   */
  async function mayReusePendingOrder(customerId: string): Promise<boolean> {
    const pending = await store.pendingOrderIntent(customerId);
    if (!pending) return true;

    let status: IntentStatus;
    try {
      status = (await gateway.retrievePaymentIntent(pending.intentId)).status;
    } catch {
      // Could not ask: a fresh order cannot inherit a payment.
      return false;
    }
    if (status === "succeeded") {
      // Paid but unrecorded: settle it now. Idempotent.
      await settlePaid(pending.orderId);
      return false;
    }
    if (status === "failed" || status === "canceled") {
      // A cancelled intent can never be paid: release the order.
      await transact((tx) => finalizeFailed(tx, pending.orderId));
      return false;
    }
    // Live: same order, key and intent, which the double-charge guard depends on.
    return true;
  }

  function meterChoiceRefusal(e: DeliveryChoiceError, verdict?: string): void {
    if (e.code === "delivery_type_changed") return emitMetric(ns(), "DeliveryTypeChanged");
    if (e.code === "date_unavailable") return emitMetric(ns(), "StandardDateRefused");
    if (e.code === "no_windows_available") return emitMetric(ns(), "SlotBookings", 1, { outcome: "refused_no_windows" });
    if (e.code === "slot_required") return emitMetric(ns(), "SlotBookings", 1, { outcome: "refused_no_choice" });
    const outcome =
      e.code === "slot_unavailable" && verdict === "full" ? "refused_full"
      : e.code === "slot_unavailable" && verdict === "uncollectable" ? "refused_uncollectable"
      : e.code === "slot_unavailable" && verdict === "cutoff" ? "refused_cutoff"
      : "refused_unknown";
    emitMetric(ns(), "SlotBookings", 1, { outcome });
  }

  return {
    mayReusePendingOrder,

    /** Safe to call again for the same basket: it resolves to the same order and intent. */
    async createIntent(customerId: string, input: IntentInput, now: Date) {
      if (!isUuid(input.addressId)) throw new AddressNotFoundError();

      const lines = await store.cartLines(customerId);
      const address = await store.addressSnapshot(customerId, input.addressId);
      if (!address) throw new AddressNotFoundError();
      // Refused here: the provider would fail a zero amount without explanation.
      if (lines.length === 0) throw new EmptyCartError();

      // Out-of-stock lines are already gone and partial lines capped, so the charge covers only stock.
      const itemSubtotalCents = lines.reduce((sum, l) => sum + l.unitCents * l.quantity, 0);
      if (lines.some((l) => l.requestedQuantity > l.quantity)) emitMetric(ns(), "StockBlocked", 1, { stage: "checkout" });

      // Re-decided here, so a client that ignores the cart's gate is still refused.
      const policy = await deps.policy();
      if (!meetsMinimum(policy, itemSubtotalCents)) {
        throw new BelowMinimumError(policy.minimumSubtotalCents, remainingToMinimum(policy, itemSubtotalCents));
      }

      // Recomputed here, never taken from the cart or the request: first on goods alone (the fee judges
      // goods after promotions), then again once the delivery type and fee are known.
      const pendingBefore = await store.pendingOrderIntent(customerId);
      const goodsPriced = await deps.promos({ customerId, lines, deliveryType: null, deliveryFeeCents: null, now, excludeOrderId: pendingBefore?.orderId ?? null });
      const discount = { cents: goodsPriced.outcome.goodsDiscountCents };

      const postcode = destinationPostcode(address);
      if (!postcode) throw new AddressNotFoundError();
      let quote: QuoteResult;
      try {
        // Goods after promotions, before delivery. Points are payment, not part of it.
        quote = await deps.quoter(customerId, postcode, packagesFromLines(lines), now, basketValueCents(itemSubtotalCents, discount.cents));
      } catch (err) {
        // A listed postcode that cannot be priced must never happen; it pages. Never free delivery.
        if (err instanceof ListedPostcodeUnpricedError || err instanceof NoActivePlanError || err instanceof CourierNotPurchasableError) emitMetric(ns(), "DeliveryQuoteFailures");
        throw err;
      }
      emitMetric(ns(), "DeliveryQuotes", 1, { outcome: deliveryOutcome(quote) });
      if (!quote.serviced) throw new NotServiceableError();
      // Pages: a covered address with no window switched on.
      if (quote.coverage === "effy" && quote.effyWindows.unavailable === "none_defined") emitMetric(ns(), "EffyWindowsNoneDefined");

      // The delivery type must be the one the shopper was shown, refused before anything is written: a
      // courier order is asked for by name, and a stale "Courier delivery" screen sees the windows first.
      if (quote.coverage === "courier" ? input.deliveryType !== "courier" : input.deliveryType === "courier") {
        const changed = new DeliveryChoiceError("delivery_type_changed");
        meterChoiceRefusal(changed);
        throw changed;
      }
      const soldType: SoldDelivery =
        quote.coverage === "courier"
          ? { type: "courier", reason: quote.reason, courierEstimate: quote.estimate, courierServiceId: quote.serviceId, courierCollection: quote.collection }
          : { type: "effy", reason: "in_coverage", courierEstimate: null };

      // Refused before anything is written when the window is no longer offered.
      let packages: PackageDelivery[];
      let hold: SlotHold | null;
      let fee: PricedFee;
      let promise: SoldDelivery["promise"];
      let asapEstimate: string | null;
      try {
        ({ packages, hold, fee, promise, asapEstimate } = quote.coverage === "courier"
          // Nothing to choose or hold: each shop's package goes by courier.
          ? resolveCourier(quote, packagesFromLines(lines))
          : resolveEffyChoice(quote, input.deliveryWindow ?? null, input.deliveryPromise === "asap", now));
      } catch (err) {
        if (err instanceof DeliveryChoiceError) meterChoiceRefusal(err);
        throw err;
      }
      const sold: SoldDelivery = { ...soldType, promise, asapEstimate };
      // One fee for the order, never a sum over packages.
      const deliveryFeeCents = fee.totalCents;

      // The final price, with the delivery type and fee known.
      const priced = await deps.promos({
        customerId, lines, deliveryType: soldType.type, deliveryFeeCents, now, excludeOrderId: pendingBefore?.orderId ?? null,
      });
      const goodsDiscountCents = priced.outcome.goodsDiscountCents;
      const deliveryDiscountCents = priced.outcome.deliveryDiscountCents;
      // Refused before anything is written when the promotions total differs from the one shown.
      const expected = input.expectedDiscount ?? "";
      if (expected !== "" && parseCents(expected) !== goodsDiscountCents + deliveryDiscountCents) {
        emitMetric(ns(), "PromotionsChanged");
        throw new PromotionsChangedRefusal(parseCents(expected), goodsDiscountCents + deliveryDiscountCents);
      }
      let grandTotalCents = Math.max(0, itemSubtotalCents - goodsDiscountCents);

      // Refused before anything is written when the delivery total differs from the one shown.
      if (input.shownDeliveryAmount !== "" && parseCents(input.shownDeliveryAmount) !== deliveryFeeCents) {
        emitMetric(ns(), "DeliveryFeeChanged");
        throw new DeliveryFeeChangedError(parseCents(input.shownDeliveryAmount), deliveryFeeCents);
      }
      if (fee.breakdown.freeApplied) emitMetric(ns(), "FreeDeliveryOrders");
      grandTotalCents += deliveryFeeCents - deliveryDiscountCents;

      // Points pay part of the final total; refused, never clamped, so the shopper sees real figures.
      let pointsUsed = input.pointsToUse;
      let centsPerPoint = 1;
      if (pointsUsed > 0) {
        ({ centsPerPoint } = await store.pointsFor(customerId, now));
        const maxForTotal = Math.floor(grandTotalCents / centsPerPoint);
        if (pointsUsed > maxForTotal) throw new PointsExceedTotalError(maxForTotal);
        const remainder = grandTotalCents - pointsUsed * centsPerPoint;
        if (remainder > 0 && remainder < CARD_MINIMUM_CENTS) {
          throw new PointsCardRemainderTooSmallError(Math.max(0, Math.floor((grandTotalCents - CARD_MINIMUM_CENTS) / centsPerPoint)));
        }
      } else {
        pointsUsed = 0;
      }
      const pointsValueCents = pointsUsed * centsPerPoint;
      const cardCents = grandTotalCents - pointsValueCents;

      const reusePending = await mayReusePendingOrder(customerId);
      const entered = priced.outcome.applied.find((a) => a.codeId !== null);
      const { orderId, orderNumber } = await store.upsertPendingOrder(
        customerId,
        {
          itemSubtotalCents, deliveryFeeCents, deliveryFeeBreakdown: storedBreakdown(fee), discountCents: goodsDiscountCents,
          // The code's text stays on the order; `order_promotion` has the rest.
          promoCode: entered?.codeText ?? null,
          grandTotalCents, currency: CURRENCY,
          pointsUsed, pointsCentsPerPoint: pointsUsed > 0 ? centsPerPoint : null, pointsValueCents,
        },
        address, lines, reusePending,
      );

      // What each promotion took is kept and its uses held under a lock per promotion, so the last use
      // goes to one shopper. A promotion that no longer fits refuses the intent.
      try {
        await store.recordPromotions(orderId, customerId, priced, now);
      } catch (err) {
        if (err instanceof PromotionsChangedError) {
          emitMetric(ns(), "PromotionsChanged");
          throw new PromotionsChangedRefusal(null, null);
        }
        throw err;
      }

      // Points are set aside before the delivery place and any charge; zero releases an earlier hold. A
      // refusal leaves the order pending with nothing held.
      await store.holdPoints(orderId, customerId, pointsUsed, now);

      // Held under the slot's row lock before the intent, so losing the last place costs nothing.
      let slotHeldUntil: Date | null;
      try {
        slotHeldUntil = await store.captureDelivery(orderId, packages, hold, sold);
      } catch (err) {
        if (err instanceof SlotUnavailableError) {
          const choice = new DeliveryChoiceError("slot_unavailable");
          meterChoiceRefusal(choice, err.verdict);
          throw choice;
        }
        throw err;
      }
      if (slotHeldUntil) emitMetric(ns(), "SlotBookings", 1, { outcome: "held" });

      // Written on every intent, so switching back to "same as shipping" clears it.
      let billingSnapshot = address;
      if (input.billingAddressId === "" || input.billingAddressId === input.addressId) {
        await store.setOrderBilling(orderId, null);
      } else {
        if (!isUuid(input.billingAddressId)) throw new AddressNotFoundError();
        const billing = await store.addressSnapshot(customerId, input.billingAddressId);
        if (!billing) throw new AddressNotFoundError();
        await store.setOrderBilling(orderId, billing);
        billingSnapshot = billing;
      }

      // Written on every intent, so a cleared note is not delivered from an earlier draft.
      await store.setOrderDeliveryInstructions(orderId, input.deliveryInstructions.handover, input.deliveryInstructions.note);

      const pointsSplit = {
        pointsUsed, pointsAmount: formatCents(pointsValueCents), cardAmount: formatCents(cardCents),
      };

      // Points cover everything: no provider, no intent, no card.
      if (cardCents === 0 && pointsUsed > 0) {
        // An earlier attempt's intent must not stay payable. Cancel it; if it was already paid, settle that
        // and refuse this one.
        if (pendingBefore && pendingBefore.orderId === orderId) {
          const status = await gateway.cancelPaymentIntent(pendingBefore.intentId);
          if (status === "succeeded" || status === "requires_action") {
            await store.holdPoints(orderId, customerId, 0, now);
            if (status === "succeeded") await settlePaid(orderId);
            throw new PaymentInProgressError();
          }
        }
        await store.placePointsOnly(orderId);
        await settlePaid(orderId);
        emitMetric(ns(), "PointsOnlyOrders");
        return {
          orderId, orderNumber, clientSecret: "", publishableKey: deps.publishableKey,
          grandTotalAmount: formatCents(grandTotalCents), currency: CURRENCY,
          deliveryFee: feeDTO(fee),
          ...pointsSplit, paidWithPoints: true,
          billingDetails: null,
          ...(slotHeldUntil ? { slotHeldUntil: operatingStamp(slotHeldUntil) } : {}),
          ...(sold ? { deliveryType: sold.type } : {}),
        };
      }

      // Resolved before the intent so a kept card can attach to it.
      const profile = await store.paymentProfile(customerId);
      const providerCustomerId = await gateway.ensureCustomer({
        existing: profile.providerCustomerId, email: profile.email, name: profile.name, customerId,
      });
      if (providerCustomerId !== profile.providerCustomerId) await store.setProviderCustomerId(customerId, providerCustomerId);

      // The session is created alongside the intent, only for clients with a provider-owned method list.
      // `setup_future_usage` is not set: keeping the card is the shopper's choice at confirmation.
      const [intent, session] = await Promise.all([
        // The card amount (total less points). The key covers it, so changing points gets a new intent.
        gateway.createPaymentIntent({
          amountMinor: cardCents, currency: CURRENCY,
          idempotencyKey: idempotencyKey(orderId, cardCents, providerCustomerId),
          orderId, orderNumber, customerId: providerCustomerId,
        }),
        input.wantsProviderMethodList ? gateway.createCustomerSession(providerCustomerId) : Promise.resolve(null),
      ]);

      await store.upsertPayment(orderId, intent.id, cardCents, paymentStatusFor(intent.status));

      return {
        orderId,
        orderNumber,
        clientSecret: intent.clientSecret,
        publishableKey: deps.publishableKey,
        grandTotalAmount: formatCents(grandTotalCents),
        currency: CURRENCY,
        // Omitted when there is no session; the provider customer id goes only with it.
        ...(session ? { customerSessionSecret: session.clientSecret, customerId: providerCustomerId } : {}),
        // A boolean: the raw list would leak account configuration.
        payOverTimeAvailable: intent.availableMethods.some((m) => PAY_OVER_TIME.has(m)),
        billingDetails: billingDetailsFrom(billingSnapshot, profile.name, profile.email),
        deliveryFee: feeDTO(fee),
        ...pointsSplit,
        paidWithPoints: false,
        ...(slotHeldUntil ? { slotHeldUntil: operatingStamp(slotHeldUntil) } : {}),
        ...(sold ? { deliveryType: sold.type } : {}),
      };
    },

    /** Settles the order even if the provider's webhook never arrives. */
    async confirm(scope: Pick<RequestScope, "log">, customerId: string, orderId: string): Promise<{ orderId: string; paid: boolean }> {
      if (!isUuid(orderId)) throw new OrderNotFoundError();
      const intentId = await store.orderIntentForCustomer(customerId, orderId);
      if (!intentId) throw new OrderNotFoundError();

      const { status } = await gateway.retrievePaymentIntent(intentId);
      if (status === "succeeded") {
        await settlePaid(orderId);
        await capturePaymentMethod(scope, orderId, intentId);
        return { orderId, paid: true };
      }
      if (status === "failed") await transact((tx) => finalizeFailed(tx, orderId));
      return { orderId, paid: false };
    },

    capturePaymentMethod,

    /** A provider failure propagates: "no cards" and "could not ask" are different facts. */
    async listKeptCards(customerId: string, now: Date) {
      const { providerCustomerId } = await store.paymentProfile(customerId);
      if (!providerCustomerId) return [];
      return (await gateway.listSavedCards(providerCustomerId)).map((c) => {
        const expired = cardExpired(c.expMonth, c.expYear, now);
        return {
          id: c.id, brand: c.brand, last4: c.last4, expMonth: c.expMonth, expYear: c.expYear, isDefault: c.isDefault,
          usable: !expired,
          ...(expired ? { unusableReason: "This card has expired." } : {}),
        };
      });
    },

    /** Ownership is proven by re-listing the shopper's own cards first. */
    async removeKeptCard(customerId: string, paymentMethodId: string): Promise<void> {
      const { providerCustomerId } = await store.paymentProfile(customerId);
      if (!providerCustomerId) throw new PaymentMethodNotFoundError();
      const cards = await gateway.listSavedCards(providerCustomerId);
      if (!cards.some((c) => c.id === paymentMethodId)) throw new PaymentMethodNotFoundError();
      await gateway.detachPaymentMethod(paymentMethodId);
    },
  };
}

export type CheckoutService = ReturnType<typeof createCheckoutService>;
