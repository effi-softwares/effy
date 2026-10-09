// Checkout: the amount, the pending order, the payment intent, and the routes into payment
// finalisation. No HTTP, no SQL.
//
// ⚠ THE AMOUNT IS DECIDED HERE AND NOWHERE ELSE (070 FR-014). Prices come from the catalogue, the
// discount from the cart's applied code re-evaluated now, the fee from the delivery engine. No
// figure a client sends is ever used.
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
  DeliveryChoiceError, resolveCourier, resolveEffyWindow, type ChosenWindow,
} from "./delivery-choice";
import {
  AddressNotFoundError, CARD_MINIMUM_CENTS, capturedQuote, destinationPostcode, packagesFromLines, QUOTE_VALIDITY_MS, type DeliveryQuoter,
  type PromoSource,
} from "./quote";
import { SlotUnavailableError, type CheckoutStore, type PackageDelivery, type SlotHold, type SoldDelivery } from "./store";

export { AddressNotFoundError };

/** The cart has nothing that can be bought. */
export class EmptyCartError extends Error {}
/** The destination is in no active delivery zone — the single "not there yet" outcome (047). */
export class NotServiceableError extends Error {}
/** Raised for a missing order AND for someone else's. */
export class OrderNotFoundError extends Error {}
/**
 * Covers BOTH "no such card" and "not this shopper's card" (051). Deliberately indistinguishable:
 * separating them would make the route an oracle for whether a payment-method id exists.
 */
export class PaymentMethodNotFoundError extends Error {}

/**
 * 074 — the points asked for cannot be used as asked. Carries the most that CAN be, so the client can
 * offer it ("Use 4,750 points instead") rather than send the shopper back to guess.
 */
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
/**
 * 074 — a payment for this order is already in flight with the provider, so it cannot switch to being
 * paid entirely with points. The client re-reads; nothing was charged twice and no points were spent.
 */
export class PaymentInProgressError extends Error {}

export { CARD_MINIMUM_CENTS };

/** The order is below the minimum. Carries how much more is needed — never a shop. */
export class BelowMinimumError extends Error {
  constructor(readonly minimumCents: number, readonly remainingCents: number) {
    super("checkout: order below the minimum");
  }
}

export interface IntentInput {
  addressId: string;
  /** Empty, or equal to `addressId`, means "billing same as shipping". Never affects the amount. */
  billingAddressId: string;
  /**
   * The ONE window chosen for the order (078); null when the client sent none. Required when Effy
   * delivers; a courier order has none.
   */
  deliveryWindow?: ChosenWindow | null;
  /**
   * 079 — the delivery type the client is SHOWING; null/absent when it said nothing. A courier order
   * requires "courier"; a type that is not the one that applies now is refused before anything is
   * written, so nobody pays a courier fee for a screen that showed Effy's windows, or the reverse.
   */
  deliveryType?: "effy" | "courier" | null;
  /** ALREADY validated and normalised. The only source of an order's instructions (066). */
  deliveryInstructions: DeliveryInstructionsDTO;
  /** Set only by a client that renders a provider-owned payment-method list (mobile). */
  wantsProviderMethodList: boolean;
  /** 074 — whole points to pay with; 0 for none. Validated by the handler as a non-negative integer. */
  pointsToUse: number;
  /**
   * 077 — the delivery total the client is showing, as a 2-dp amount; "" when it sent none (a client
   * built before 077). Validated by the handler.
   */
  shownDeliveryAmount: string;
}

export type { PromoSource };

/**
 * 077 — the delivery total is not the one the client showed (a new fee plan went live, or the
 * basket crossed a threshold, between the quote and the pay button). NOTHING has been written: the
 * shopper is shown the new total and decides again. Never charged an amount they did not see.
 */
export class DeliveryFeeChangedError extends Error {
  constructor(readonly shownCents: number, readonly nowCents: number) {
    super(`checkout: delivery fee changed (shown ${shownCents}, now ${nowCents})`);
  }
}

const PAY_OVER_TIME = new Set(["klarna", "zip", "afterpay_clearpay"]);

/**
 * Deterministic, so a retried create returns the SAME intent rather than a second charge.
 *
 * ⚠ It covers the order, the AMOUNT and the provider customer. A basket that changed has a
 * different amount and gets a new intent; the same basket retried gets the one it already has.
 */
export function idempotencyKey(orderId: string, amountCents: number, providerCustomerId: string): string {
  return createHash("sha256").update(`pi:${orderId}:${amountCents}:${providerCustomerId}`).digest("hex");
}

export function paymentStatusFor(s: IntentStatus): string {
  return s === "succeeded" || s === "requires_action" || s === "canceled" || s === "failed" ? s : "requires_payment";
}

function deliveryOutcome(q: QuoteResult): string {
  if (!q.serviced) return "unserviced";
  // 079 — a courier delivers: because Effy does not go there, or because Effy has no window left.
  if (q.coverage === "courier") return q.reason === "no_window" ? "courier_fallback" : "courier";
  // Whether any window can be chosen, and if not, which kind of nothing (078).
  return q.effyWindows.unavailable ?? "windows_offered";
}

/**
 * What the client passes back at confirmation, derived from the order's own snapshot — the payment
 * step no longer asks the shopper for a country, a postcode or a name (051).
 */
export function billingDetailsFrom(snapshot: Record<string, unknown> | null, name: string, email: string) {
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const out = { name, email, address: { line1: "", line2: "", city: "", state: "", postalCode: "", country: "AU" } };
  if (!snapshot) return out;
  out.address = {
    line1: text(snapshot.line1), line2: text(snapshot.line2), city: text(snapshot.city),
    state: text(snapshot.region), postalCode: text(snapshot.postalCode),
    // Effy sells in one country; a snapshot may predate the field.
    country: text(snapshot.country) || "AU",
  };
  // The recipient on the order is a better name for a receipt than a profile name, which may be
  // empty on the one-time-code and federated sign-in routes.
  if (text(snapshot.recipientName) !== "") out.name = text(snapshot.recipientName);
  return out;
}

/** A card whose expiry month has passed. A card is good THROUGH its expiry month. */
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

  /** Run the paid transition in its own transaction and meter it once it has committed. */
  async function settlePaid(orderId: string): Promise<FinalizeOutcome> {
    const out = await transact((tx) => finalizeSucceeded(tx, orderId));
    meterFinalize(ns(), out);
    await announcePaid(out);
    return out;
  }

  /**
   * Record how the order was paid, for the receipt (052). AFTER the commit, best-effort: the order
   * is already paid, a receipt without a payment line is a supported state, and a provider read
   * inside the payment transaction would hold its locks across a network call.
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
   * MAY THIS CHECKOUT RECYCLE THE CUSTOMER'S OPEN ORDER?
   *
   * Recycling is right only while that order's payment attempt is still LIVE. Recycling one whose
   * intent has already settled is what makes a second checkout resolve to the FIRST one's payment
   * — the shopper pays once and their second basket is never charged, or the reverse. Only the
   * provider knows which it is, so it is asked.
   */
  async function mayReusePendingOrder(customerId: string): Promise<boolean> {
    const pending = await store.pendingOrderIntent(customerId);
    // No open order, or one that never reached an intent: nothing exists that could collide.
    if (!pending) return true;

    let status: IntentStatus;
    try {
      status = (await gateway.retrievePaymentIntent(pending.intentId)).status;
    } catch {
      // Could not ask. Not reusing is the safe direction: a fresh order cannot inherit a payment.
      return false;
    }
    if (status === "succeeded") {
      // Paid, and nothing told the database. Settle it here so it reaches order history and the
      // shops. Idempotent; a notification that arrives later changes nothing.
      await settlePaid(pending.orderId);
      return false;
    }
    if (status === "failed" || status === "canceled") {
      // ⚠ A cancelled intent can never be paid: recycling this row would hand the shopper a dead
      // intent and a pay button that cannot work. Release it.
      await transact((tx) => finalizeFailed(tx, pending.orderId));
      return false;
    }
    // Live. Same order, same key, same intent — exactly what the double-charge guard depends on.
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

    /**
     * Compute the charge, write the pending order, hold the delivery place, and create the payment
     * intent. Safe to call again for the same basket: it resolves to the same order and intent.
     */
    async createIntent(customerId: string, input: IntentInput, now: Date) {
      if (!isUuid(input.addressId)) throw new AddressNotFoundError();

      const lines = await store.cartLines(customerId);
      const address = await store.addressSnapshot(customerId, input.addressId);
      if (!address) throw new AddressNotFoundError();
      // ⚠ Refused HERE rather than left to the provider (070): an empty cart used to reach the
      // intent call with a zero amount and come back as an unexplained failure.
      if (lines.length === 0) throw new EmptyCartError();

      // ⚠ 054: lines that are out of stock have already dropped out of `cartLines`, and a
      // partly-supplied line arrives with its quantity already capped. So the subtotal — and
      // therefore the charge — can only cover units the platform believes exist.
      const itemSubtotalCents = lines.reduce((sum, l) => sum + l.unitCents * l.quantity, 0);
      // One increment per checkout that had to be trimmed, not one per line.
      if (lines.some((l) => l.requestedQuantity > l.quantity)) emitMetric(ns(), "StockBlocked", 1, { stage: "checkout" });

      // ⚠ The minimum is re-decided HERE, not trusted from the cart's `checkout.allowed` (027
      // FR-056): a client that ignores the cart's own gate must still be refused.
      const policy = await deps.policy();
      if (!meetsMinimum(policy, itemSubtotalCents)) {
        throw new BelowMinimumError(policy.minimumSubtotalCents, remainingToMinimum(policy, itemSubtotalCents));
      }

      // The discount is RECOMPUTED from the cart's applied code — never carried from the cart
      // response and never taken from the request (027 FR-027/FR-042).
      const discount = await deps.promos(customerId, itemSubtotalCents);
      // A discount larger than the basket cannot produce a negative charge.
      let grandTotalCents = Math.max(0, itemSubtotalCents - discount.cents);

      // The delivery fee: from the destination postcode and the cart's per-shop weights.
      const postcode = destinationPostcode(address);
      if (!postcode) throw new AddressNotFoundError();
      let quote: QuoteResult;
      try {
        // The basket as the fee's rules judge it: goods after the promotion, before delivery (077
        // FR-005). Points are not in it — they are how the order is paid, further down.
        quote = await deps.quoter(customerId, postcode, packagesFromLines(lines), now, basketValueCents(itemSubtotalCents, discount.cents));
      } catch (err) {
        // ⚠ A listed postcode that could not be priced must never happen; it is a page, not a
        // number to watch idly (047 FR-029, 077 FR-009). Never free delivery.
        if (err instanceof ListedPostcodeUnpricedError || err instanceof NoActivePlanError || err instanceof CourierNotPurchasableError) emitMetric(ns(), "DeliveryQuoteFailures");
        throw err;
      }
      emitMetric(ns(), "DeliveryQuotes", 1, { outcome: deliveryOutcome(quote) });
      if (!quote.serviced) throw new NotServiceableError();
      // ⚠ A page, not a number to watch: a covered address and not one window switched on (078 FR-020).
      if (quote.coverage === "effy" && quote.effyWindows.unavailable === "none_defined") emitMetric(ns(), "EffyWindowsNoneDefined");

      // ⚠ 079 FR-005 — WHO DELIVERS MUST BE WHAT THE SHOPPER WAS SHOWN. Refused HERE, before anything
      // is written: a courier order has to be asked for by name (a client built before 079 cannot
      // draw one, so it cannot buy one), and a client showing "Courier delivery" for an address Effy
      // now delivers to is shown the windows first. Same idea as the shown delivery total below.
      if (quote.coverage === "courier" ? input.deliveryType !== "courier" : input.deliveryType === "courier") {
        const changed = new DeliveryChoiceError("delivery_type_changed");
        meterChoiceRefusal(changed);
        throw changed;
      }
      // What the order is recorded as. Every order has a delivery type since 083; only orders placed
      // before delivery types have none, and they keep it that way.
      const sold: SoldDelivery =
        quote.coverage === "courier"
          ? { type: "courier", reason: quote.reason, courierEstimate: quote.estimate, courierServiceId: quote.serviceId, courierCollection: quote.collection }
          : { type: "effy", reason: "in_coverage", courierEstimate: null };

      // ⚠ Refused HERE, before the order is written and long before a payment intent exists, when
      // the window is no longer on offer (069, 078).
      let packages: PackageDelivery[];
      let hold: SlotHold | null;
      let fee: PricedFee;
      try {
        ({ packages, hold, fee } = quote.coverage === "courier"
          // 079 — nothing to choose, nothing to hold: the cart's shops, each sent by courier.
          ? resolveCourier(quote, packagesFromLines(lines))
          : resolveEffyWindow(quote, input.deliveryWindow ?? null, now));
      } catch (err) {
        if (err instanceof DeliveryChoiceError) meterChoiceRefusal(err);
        throw err;
      }
      // ONE fee for the order (077) — never a sum over packages.
      const deliveryFeeCents = fee.totalCents;

      // ⚠ Refused HERE, before anything is written (077 FR-031): the client says what delivery total
      // it is showing, and if that is not what the order would be charged, the shopper sees the new
      // one first. A client built before 077 sends nothing and is priced without the check.
      if (input.shownDeliveryAmount !== "" && parseCents(input.shownDeliveryAmount) !== deliveryFeeCents) {
        emitMetric(ns(), "DeliveryFeeChanged");
        throw new DeliveryFeeChangedError(parseCents(input.shownDeliveryAmount), deliveryFeeCents);
      }
      if (fee.breakdown.freeApplied) emitMetric(ns(), "FreeDeliveryOrders");
      grandTotalCents += deliveryFeeCents;

      // 074 — points are a WAY OF PAYING (FR-018): the order total above is final, and the card pays
      // what the points do not. Refused, never clamped, so the shopper is shown the real figures.
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

      const pendingBefore = await store.pendingOrderIntent(customerId);
      const reusePending = await mayReusePendingOrder(customerId);
      const { orderId, orderNumber } = await store.upsertPendingOrder(
        customerId,
        {
          itemSubtotalCents, deliveryFeeCents, deliveryFeeBreakdown: storedBreakdown(fee), discountCents: discount.cents,
          promoCodeId: discount.promo?.id ?? null, promoCode: discount.promo?.code ?? null,
          grandTotalCents, currency: CURRENCY,
          pointsUsed, pointsCentsPerPoint: pointsUsed > 0 ? centsPerPoint : null, pointsValueCents,
        },
        address, lines, reusePending,
      );

      // 074 — the points are SET ASIDE here, before the delivery place and long before any charge, at
      // the same "last moment the server can refuse" as the slot (research R3). Zero releases any hold
      // this order had from an earlier attempt. ⚠ A refusal here (InsufficientPointsError) leaves the
      // order pending with nothing held, and the handler re-shows the shopper what they have.
      await store.holdPoints(orderId, customerId, pointsUsed, now);

      // ⚠ The place is HELD here, under the slot's row lock, BEFORE the payment intent is created:
      // a shopper who loses the last place is refused while there is still nothing for them to pay.
      let slotHeldUntil: Date | null;
      try {
        slotHeldUntil = await store.captureDelivery(orderId, capturedQuote(quote), new Date(now.getTime() + QUOTE_VALIDITY_MS), packages, hold, sold);
      } catch (err) {
        if (err instanceof SlotUnavailableError) {
          const choice = new DeliveryChoiceError("slot_unavailable");
          meterChoiceRefusal(choice, err.verdict);
          throw choice;
        }
        throw err;
      }
      if (slotHeldUntil) emitMetric(ns(), "SlotBookings", 1, { outcome: "held" });

      // Billing (023): a snapshot when the shopper diverged from shipping; otherwise NULL. Written
      // on every intent, so toggling "same as shipping" back ON clears a prior value.
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

      // Delivery instructions (066): written on EVERY intent, including with nothing — a shopper
      // who clears the note and pays must not have the earlier draft delivered with their order.
      await store.setOrderDeliveryInstructions(orderId, input.deliveryInstructions.handover, input.deliveryInstructions.note);

      const pointsSplit = {
        pointsUsed, pointsAmount: formatCents(pointsValueCents), cardAmount: formatCents(cardCents),
      };

      // 074 — POINTS COVER EVERYTHING: no provider, no intent, no card. The order is placed now.
      if (cardCents === 0 && pointsUsed > 0) {
        // ⚠ An intent this order made on an earlier attempt must not stay payable: paying it would
        // charge a card for an order already paid with points. Cancel it; if the provider says it was
        // already paid, settle THAT and refuse this — the shopper re-reads and sees one paid order.
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
          // Nothing is confirmed with the provider, so there is nothing to pass back.
          billingDetails: null,
          // Already confirmed by the paid transition above; carried for a client that shows it.
          ...(slotHeldUntil ? { slotHeldUntil: operatingStamp(slotHeldUntil) } : {}),
          ...(sold ? { deliveryType: sold.type } : {}),
        };
      }

      // The provider customer, resolved before the intent so a kept card can attach to it.
      const profile = await store.paymentProfile(customerId);
      const providerCustomerId = await gateway.ensureCustomer({
        existing: profile.providerCustomerId, email: profile.email, name: profile.name, customerId,
      });
      if (providerCustomerId !== profile.providerCustomerId) await store.setProviderCustomerId(customerId, providerCustomerId);

      // The session is minted CONCURRENTLY with the intent, and only for a client that renders a
      // provider-owned method list.
      // ⚠ `setup_future_usage` is deliberately NOT set: whether the card is kept is the shopper's
      // choice, made at confirmation; setting it here would keep a card they declined (051).
      const [intent, session] = await Promise.all([
        // ⚠ The CARD amount — the order total less points (074). The key covers it, so changing the
        // points chosen gets a fresh intent exactly as changing the basket does.
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
        // ⚠ Omitted, not null, when there is no session — the web response stays byte-identical to
        // before. The provider customer id accompanies the session and ONLY the session.
        ...(session ? { customerSessionSecret: session.clientSecret, customerId: providerCustomerId } : {}),
        // A BOOLEAN, not the list: which instalment providers are offered is the payment element's
        // business, and the raw list would leak account configuration.
        payOverTimeAvailable: intent.availableMethods.some((m) => PAY_OVER_TIME.has(m)),
        billingDetails: billingDetailsFrom(billingSnapshot, profile.name, profile.email),
        // 077 — the delivery charge inside the total, as the lines the shopper was shown.
        deliveryFee: feeDTO(fee),
        ...pointsSplit,
        paidWithPoints: false,
        // Omitted when no package is same-day.
        ...(slotHeldUntil ? { slotHeldUntil: operatingStamp(slotHeldUntil) } : {}),
        // 079 — who delivers the order as written. Absent under the checkout that predates the model.
        ...(sold ? { deliveryType: sold.type } : {}),
      };
    },

    /**
     * The shopper's return from the provider: re-read the intent and settle the order. This is
     * what makes a payment land even if the provider's notification never does.
     */
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

    /**
     * The shopper's kept cards, read live from the provider.
     *
     * ⚠ A provider failure PROPAGATES. It is never an empty list: "you have no cards" and "we
     * could not ask" are different facts (051 FR-036).
     */
    async listKeptCards(customerId: string, now: Date) {
      const { providerCustomerId } = await store.paymentProfile(customerId);
      if (!providerCustomerId) return [];
      return (await gateway.listSavedCards(providerCustomerId)).map((c) => {
        const expired = cardExpired(c.expMonth, c.expYear, now);
        return {
          id: c.id, brand: c.brand, last4: c.last4, expMonth: c.expMonth, expYear: c.expYear, isDefault: c.isDefault,
          usable: !expired,
          // Omitted when usable.
          ...(expired ? { unusableReason: "This card has expired." } : {}),
        };
      });
    },

    /** Remove a kept card. Ownership is proven by re-listing the shopper's own cards first. */
    async removeKeptCard(customerId: string, paymentMethodId: string): Promise<void> {
      const { providerCustomerId } = await store.paymentProfile(customerId);
      if (!providerCustomerId) throw new PaymentMethodNotFoundError();
      const cards = await gateway.listSavedCards(providerCustomerId);
      // ⚠ The id is client-supplied; a detach that trusted it would be a cross-customer write.
      if (!cards.some((c) => c.id === paymentMethodId)) throw new PaymentMethodNotFoundError();
      await gateway.detachPaymentMethod(paymentMethodId);
    },
  };
}

export type CheckoutService = ReturnType<typeof createCheckoutService>;
