import type { Pricing } from "./pricing";

/** Stand-in pricings for tests that are not about the engine. */
export const NO_PROMOTIONS: Pricing = {
  outcome: { applied: [], lineDiscounts: {}, goodsDiscountCents: 0, deliveryDiscountCents: 0, notApplied: [] },
  records: new Map(),
  enteredRefusal: null,
  enteredPromotionId: null,
  singleUseCodeIds: new Set(),
};

export const flatPricing = (cents: number): Pricing => ({
  ...NO_PROMOTIONS,
  outcome: { ...NO_PROMOTIONS.outcome, goodsDiscountCents: cents },
});
