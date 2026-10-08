// POST /commerce/v1/checkout/intent — compute the charge, write the pending order, hold the
// delivery place and create the payment intent. Safe to repeat for the same basket.
//
// ⚠ There is no amount and no `billingDetails` on this request, by design: the amount is the
// platform's, and billing details are derived from the order's own address snapshot.
import { json, validationFailed } from "@effy/edge-shared";
import { normaliseDeliveryInstructions } from "@effy/shared-types";

import { DeliveryChoiceError } from "../checkout/delivery-choice";
import { quoteForCheckout } from "../checkout/quote";
import { checkoutError, deliveryChoiceRefused, deliveryFeeChanged } from "../checkout/respond";
import { DeliveryFeeChangedError } from "../checkout/service";
import { isUuid } from "../lib/ids";
import { customerRoute, jsonBody, stringField } from "../lib/route";
import { checkoutService, quoteDeps } from "../lib/wiring";

/** A non-negative amount with exactly two decimal places — how every amount crosses the wire. */
const AMOUNT = /^\d{1,7}\.\d{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const body = jsonBody(event);
  const addressId = stringField(body?.addressId);
  const billingAddressId = stringField(body?.billingAddressId);
  const deliveryMethod = stringField(body?.deliveryMethod);
  const sameDaySlotId = stringField(body?.sameDaySlotId);
  const standardDate = stringField(body?.standardDate);
  const wantsList = body?.wantsProviderMethodList;
  // 074 — absent or null means none. Anything else must be a whole number of points, 0 or more.
  const rawPoints = body?.pointsToUse;
  const pointsToUse = rawPoints === undefined || rawPoints === null ? 0 : rawPoints;
  if (
    !body || addressId === null || billingAddressId === null || deliveryMethod === null || sameDaySlotId === null ||
    standardDate === null || (wantsList !== undefined && wantsList !== null && typeof wantsList !== "boolean")
  ) {
    return validationFailed(scope, "addressId is required");
  }
  if (typeof pointsToUse !== "number" || !Number.isSafeInteger(pointsToUse) || pointsToUse < 0) {
    return validationFailed(scope, "pointsToUse must be a whole number of points");
  }
  // 077 — absent or null means the client is not saying what it shows (one built before 077).
  const rawShown: unknown = body.shownDeliveryAmount;
  if (rawShown !== undefined && rawShown !== null && (typeof rawShown !== "string" || !AMOUNT.test(rawShown))) {
    return validationFailed(scope, "shownDeliveryAmount must be an amount like 6.00");
  }
  const shownDeliveryAmount = typeof rawShown === "string" ? rawShown : "";

  // 078 — the one window chosen for the order. Absent or null means none was sent (a client built
  // before 078, or the new delivery model is off and the three fields above apply).
  const rawWindow: unknown = body.deliveryWindow;
  let deliveryWindow: { slotId: string; date: string } | null = null;
  if (rawWindow !== undefined && rawWindow !== null) {
    const w = rawWindow as { slotId?: unknown; date?: unknown };
    if (typeof rawWindow !== "object" || typeof w.slotId !== "string" || !isUuid(w.slotId) || typeof w.date !== "string" || !ISO_DATE.test(w.date)) {
      return validationFailed(scope, "deliveryWindow must be a window id and a date like 2026-10-09");
    }
    deliveryWindow = { slotId: w.slotId, date: w.date };
  }

  // 066 — refused BEFORE anything is written. ⚠ The refusal names the field and the rule and never
  // the value: a note can hold a gate code, and a validation error is exactly what gets logged.
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
        addressId, billingAddressId, deliveryMethod, sameDaySlotId, standardDate, deliveryWindow,
        deliveryInstructions: instructions.value, wantsProviderMethodList: wantsList === true, pointsToUse,
        shownDeliveryAmount,
      },
      new Date(),
    );
    return json(200, result, scope);
  } catch (err) {
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
