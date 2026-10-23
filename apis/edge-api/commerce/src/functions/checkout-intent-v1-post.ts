// Computes the charge, writes the pending order, holds the delivery place and creates the payment
// intent. Safe to repeat. The request carries no amount or billing details: both come from the order.
import { json, validationFailed } from "@effy/edge-shared";
import { normaliseDeliveryInstructions } from "@effy/shared-types";

import { DeliveryChoiceError } from "../checkout/delivery-choice";
import { quoteForCheckout } from "../checkout/quote";
import { checkoutError, deliveryChoiceRefused, deliveryFeeChanged, promotionsChanged } from "../checkout/respond";
import { DeliveryFeeChangedError, PromotionsChangedRefusal } from "../checkout/service";
import { isUuid } from "../lib/ids";
import { customerRoute, jsonBody, stringField } from "../lib/route";
import { cartService, checkoutService, quoteDeps } from "../lib/wiring";

/** A non-negative amount with exactly two decimal places — how every amount crosses the wire. */
const AMOUNT = /^\d{1,7}\.\d{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const body = jsonBody(event);
  const addressId = stringField(body?.addressId);
  const billingAddressId = stringField(body?.billingAddressId);
  const wantsList = body?.wantsProviderMethodList;
  const rawPoints = body?.pointsToUse;
  const pointsToUse = rawPoints === undefined || rawPoints === null ? 0 : rawPoints;
  if (
    !body || addressId === null || billingAddressId === null ||
    (wantsList !== undefined && wantsList !== null && typeof wantsList !== "boolean")
  ) {
    return validationFailed(scope, "addressId is required");
  }
  if (typeof pointsToUse !== "number" || !Number.isSafeInteger(pointsToUse) || pointsToUse < 0) {
    return validationFailed(scope, "pointsToUse must be a whole number of points");
  }
  const rawShown: unknown = body.shownDeliveryAmount;
  if (rawShown !== undefined && rawShown !== null && (typeof rawShown !== "string" || !AMOUNT.test(rawShown))) {
    return validationFailed(scope, "shownDeliveryAmount must be an amount like 6.00");
  }
  const shownDeliveryAmount = typeof rawShown === "string" ? rawShown : "";

  const rawExpected: unknown = body.expectedDiscount;
  if (rawExpected !== undefined && rawExpected !== null && (typeof rawExpected !== "string" || !/^\d{1,7}\.\d{2}$/.test(rawExpected))) {
    return validationFailed(scope, "expectedDiscount must be an amount like 5.00");
  }
  const expectedDiscount = typeof rawExpected === "string" ? rawExpected : "";

  const rawWindow: unknown = body.deliveryWindow;
  let deliveryWindow: { slotId: string; date: string } | null = null;
  if (rawWindow !== undefined && rawWindow !== null) {
    const w = rawWindow as { slotId?: unknown; date?: unknown };
    if (typeof rawWindow !== "object" || typeof w.slotId !== "string" || !isUuid(w.slotId) || typeof w.date !== "string" || !ISO_DATE.test(w.date)) {
      return validationFailed(scope, "deliveryWindow must be a window id and a date like 2026-10-09");
    }
    deliveryWindow = { slotId: w.slotId, date: w.date };
  }

  // Sent instead of a window. A day with no time is a `deliveryWindow`.
  const rawPromise: unknown = body.deliveryPromise;
  if (rawPromise !== undefined && rawPromise !== null && rawPromise !== "asap") {
    return validationFailed(scope, "deliveryPromise must be asap");
  }
  const deliveryPromise = rawPromise === "asap" ? "asap" as const : null;

  const rawType: unknown = body.deliveryType;
  if (rawType !== undefined && rawType !== null && rawType !== "effy" && rawType !== "courier") {
    return validationFailed(scope, "deliveryType must be effy or courier");
  }
  const deliveryType = rawType === "effy" || rawType === "courier" ? rawType : null;

  // The refusal never echoes the value: a note can hold a gate code, and validation errors are logged.
  const instructions = normaliseDeliveryInstructions(body.deliveryInstructions);
  if (!instructions.ok) {
    return validationFailed(scope, "check your delivery instructions", [
      { field: `deliveryInstructions.${instructions.field}`, message: instructions.reason },
    ]);
  }

  try {
    const result = await checkoutService.createIntent(
      customer.id,
      {
        addressId, billingAddressId, deliveryWindow, deliveryType, deliveryPromise,
        deliveryInstructions: instructions.value, wantsProviderMethodList: wantsList === true, pointsToUse,
        shownDeliveryAmount, expectedDiscount,
      },
      new Date(),
    );
    return json(200, result, scope);
  } catch (err) {
    if (err instanceof PromotionsChangedRefusal) {
      // The current cart, so the shopper sees the new total before paying.
      const cart = await cartService.get(customer.id).catch(() => null);
      return promotionsChanged(scope, cart);
    }
    if (err instanceof DeliveryChoiceError || err instanceof DeliveryFeeChangedError) {
      // Best-effort: the refusal is still correct without the quote.
      const fresh = await quoteForCheckout(quoteDeps, customer.id, addressId, new Date()).catch((qerr: unknown) => {
        scope.log.warn({ err: qerr }, "checkout: fresh quote for refusal failed");
        return null;
      });
      return err instanceof DeliveryChoiceError ? deliveryChoiceRefused(scope, err, fresh) : deliveryFeeChanged(scope, fresh);
    }
    return checkoutError(scope, err, "intent");
  }
});
