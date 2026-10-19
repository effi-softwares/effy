import type { Pricing } from "./pricing";

/**
 * 094 — stand-in pricings for tests of what is NOT the engine (delivery quotes, payment). The engine
 * itself is tested with real promotions (shared fixtures, and the container tests here).
 */
export const NO_PROMOTIONS: Pricing = {
  outcome: { applied: [], lineDiscounts: {}, goodsDiscountCents: 0, deliveryDiscountCents: 0, notApplied: [] },
  records: new Map(),
  enteredRefusal: null,
  enteredPromotionId: null,
  singleUseCodeIds: new Set(),
};

/** A goods discount of `cents` with no lines attached — enough for anything that only reads the total. */
export const flatPricing = (cents: number): Pricing => ({
  ...NO_PROMOTIONS,
  outcome: { ...NO_PROMOTIONS.outcome, goodsDiscountCents: cents },
});
