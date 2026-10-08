// POST /commerce/v1/checkout/intent — compute the charge, write the pending order, hold the
// delivery place and create the payment intent. Safe to repeat for the same basket.
//
// ⚠ There is no amount and no `billingDetails` on this request, by design: the amount is the
// platform's, and billing details are derived from the order's own address snapshot.
import { json, validationFailed } from "@effy/edge-shared";
import { normaliseDeliveryInstructions } from "@effy/shared-types";

import { DeliveryChoiceError } from "../checkout/delivery-choice";
import { quoteForCheckout } from "../checkout/quote";
import { checkoutError, deliveryChoiceRefused } from "../checkout/respond";
import { customerRoute, jsonBody, stringField } from "../lib/route";
import { checkoutService, checkoutStore, deliveryQuoter } from "../lib/wiring";

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
        addressId, billingAddressId, deliveryMethod, sameDaySlotId, standardDate,
        deliveryInstructions: instructions.value, wantsProviderMethodList: wantsList === true, pointsToUse,
      },
      new Date(),
    );
    return json(200, result, scope);
  } catch (err) {
    if (err instanceof DeliveryChoiceError) {
      // Best-effort: the refusal is still correct without the quote.
      const fresh = await quoteForCheckout({ store: checkoutStore, quoter: deliveryQuoter }, customer.id, addressId, new Date()).catch((qerr: unknown) => {
        scope.log.warn({ err: qerr }, "checkout: fresh quote for refusal failed");
        return null;
      });
      return deliveryChoiceRefused(scope, err, fresh);
    }
    return checkoutError(scope, err, "intent");
  }
});
