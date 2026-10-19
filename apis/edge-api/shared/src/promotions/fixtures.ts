import type { Basket, BasketLine, Candidate, EngineContext } from "./engine";
import data from "./engine.fixtures.json";

/**
 * 094 — the engine fixtures and the ONE builder that fills their defaults. Used by the engine's own
 * tests and by the cart and payment-intent tests, so all three price the same baskets the same way
 * (SC-003).
 */

export type FixtureCandidate = Partial<Omit<Candidate, "targets" | "endsAt" | "createdAt">> & {
  id: string;
  targets?: { productIds?: string[]; categoryIds?: string[]; brands?: string[] };
  endsAt?: string | null;
  createdAt?: string;
};
export type FixtureLine = Partial<BasketLine> & { lineId: string; unitCents: number; quantity: number };

export interface EngineFixture {
  name: string;
  basket: { lines: FixtureLine[]; deliveryType?: "effy" | "courier" | null; deliveryFeeCents?: number | null };
  ctx?: EngineContext;
  candidates: FixtureCandidate[];
  expect: {
    goods: number;
    delivery?: number;
    applied: string[];
    lines?: Record<string, number>;
    notApplied?: { promotionId: string; reason: string; shortfallCents?: number; missingQuantity?: number }[];
    awaiting?: string[];
  };
}

export function basketOf(f: EngineFixture): Basket {
  return {
    lines: f.basket.lines.map((l) => ({ productId: l.lineId, categoryIds: [], brand: null, ...l })),
    deliveryType: f.basket.deliveryType ?? null,
    deliveryFeeCents: f.basket.deliveryFeeCents ?? null,
  };
}

export function candidateOf(c: FixtureCandidate, i: number): Candidate {
  return {
    name: c.id,
    headline: null,
    kind: "cart",
    valueType: "amount",
    percentOff: null,
    amountOffCents: null,
    maxDiscountCents: null,
    bxgy: null,
    appliesTo: c.kind === "item" || c.kind === "bxgy" ? "products" : "cart",
    deliveryTypes: ["effy", "courier"],
    minSubtotalCents: 0,
    minQuantity: null,
    daysOfWeek: null,
    minuteFrom: null,
    minuteTo: null,
    combinable: false,
    budgetLeftCents: null,
    codeId: null,
    codeText: null,
    ...c,
    targets: {
      productIds: new Set(c.targets?.productIds ?? []),
      categoryIds: new Set(c.targets?.categoryIds ?? []),
      brands: new Set(c.targets?.brands ?? []),
    },
    endsAt: c.endsAt ? new Date(c.endsAt) : null,
    createdAt: c.createdAt ? new Date(c.createdAt) : new Date(Date.UTC(2026, 0, 1, 0, i)),
  };
}

export const ENGINE_FIXTURES = (data as { fixtures: EngineFixture[] }).fixtures;
