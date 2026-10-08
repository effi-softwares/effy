import { beforeEach, describe, expect, it, vi } from "vitest";

// The repository and the live channel are mocked at the module boundary: this proves the service's
// value rules and the simulator's wording without a database. The SQL — gaps, activation, the
// immutability trigger — is proven against the real migrations in pricing.container.test.ts.
const repo = vi.hoisted(() => ({
  listPlans: vi.fn(),
  readPlan: vi.fn(),
  savePlan: vi.fn(),
  activatePlan: vi.fn(),
  slotIds: vi.fn(),
  activePlanId: vi.fn(),
}));
vi.mock("./pricing.repository", async (orig) => ({ ...(await orig<typeof import("./pricing.repository")>()), ...repo }));
const announce = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared/live", () => ({ announce }));

import { effyFee } from "@effy/edge-shared/delivery";
import type { Plan } from "@effy/edge-shared/delivery";

import { createPlan, normalise, replaceDraft, stepsOf } from "./pricing.service";

const SUB = "manager-sub";
const SLOT = "33333333-3333-4333-8333-333333333333";
const valid = {
  kind: "effy",
  name: "Spring 2026",
  baseAmount: "3.00",
  distanceBands: [{ upperKm: "10", addAmount: "0.00" }, { upperKm: null, addAmount: "4.00" }],
  weightBands: [{ upperGrams: 5000, addAmount: "0.00" }, { upperGrams: 20000, addAmount: "2.00" }],
  freeOverAmount: "80.00",
  smallOrderUnderAmount: "20.00",
  smallOrderFeeAmount: "3.00",
  todayPremiumAmount: "3.00",
  slotPremiums: [{ slotId: SLOT, addAmount: "2.00" }],
  roundingStepAmount: "0.50",
  floorAmount: "4.00",
  capAmount: "20.00",
};

const fieldsOf = (fn: () => unknown): string[] => {
  try {
    fn();
  } catch (err) {
    return ((err as { extra?: { fields?: { field: string }[] } }).extra?.fields ?? []).map((f) => f.field);
  }
  return [];
};

beforeEach(() => {
  vi.clearAllMocks();
  repo.slotIds.mockResolvedValue(new Set([SLOT]));
  repo.savePlan.mockResolvedValue("plan-1");
  repo.readPlan.mockResolvedValue({ id: "plan-1" });
});

describe("normalise — value errors are refused at save, each named (077 research R12)", () => {
  it("accepts a whole plan and normalises its amounts", () => {
    expect(normalise(valid)).toMatchObject({
      kind: "effy", name: "Spring 2026", distanceBands: [{ upperKm: "10.00", addAmount: "0.00" }, { upperKm: null, addAmount: "4.00" }],
    });
  });

  it("a half-built draft is NOT a value error — missing bands come back as gaps, later", () => {
    expect(fieldsOf(() => normalise({ ...valid, distanceBands: [], weightBands: [] }))).toEqual([]);
  });

  it.each([
    ["an amount off the rounding step", { capAmount: "20.30" }, "capAmount"],
    ["a minimum above the maximum", { floorAmount: "30.00" }, "capAmount"],
    ["a surcharge for today off the step", { todayPremiumAmount: "0.30" }, "todayPremiumAmount"],
    ["a small-order fee off the step", { smallOrderFeeAmount: "2.75" }, "smallOrderFeeAmount"],
    ["half of the small-order rule", { smallOrderFeeAmount: null }, "smallOrderFeeAmount"],
    ["a basket that would be both small and free", { smallOrderUnderAmount: "80.00" }, "smallOrderUnderAmount"],
    ["two open distance bands", { distanceBands: [{ upperKm: null, addAmount: "0" }, { upperKm: null, addAmount: "1.00" }] }, "distanceBands"],
    ["a distance in metres", { distanceBands: [{ upperKm: "12000", addAmount: "1.00" }] }, "distanceBands.0.upperKm"],
    ["a weight that is not whole grams", { weightBands: [{ upperGrams: 2.5, addAmount: "1.00" }] }, "weightBands.0.upperGrams"],
    ["a negative amount", { baseAmount: "-1.00" }, "baseAmount"],
    ["a window surcharge of nothing", { slotPremiums: [{ slotId: SLOT, addAmount: "0.00" }] }, "slotPremiums.0.addAmount"],
  ])("%s", (_what, over, field) => {
    expect(fieldsOf(() => normalise({ ...valid, ...over }))).toContain(field);
  });

  it("names every problem at once", () => {
    expect(fieldsOf(() => normalise({ ...valid, name: "", capAmount: "x", baseAmount: "-1" })).sort()).toEqual(["baseAmount", "capAmount", "name"]);
  });

  it("a courier table is not priced by distance, by window or by basket size", () => {
    const courier = { ...valid, kind: "courier", todayPremiumAmount: "0.00", freeOverAmount: null };
    expect(fieldsOf(() => normalise(courier)).sort()).toEqual(["distanceBands", "slotPremiums", "smallOrderUnderAmount"]);
    expect(fieldsOf(() => normalise({ ...courier, distanceBands: [], slotPremiums: [], smallOrderUnderAmount: null, smallOrderFeeAmount: null }))).toEqual([]);
  });
});

describe("saving", () => {
  it("creates a draft and tells an open Pricing screen", async () => {
    await createPlan(valid, SUB);
    expect(repo.savePlan).toHaveBeenCalledWith(null, expect.objectContaining({ name: "Spring 2026" }), SUB);
    expect(announce).toHaveBeenCalledWith([{ scope: "ops", kind: "pricing" }]);
  });

  it("refuses a surcharge on a window that no longer exists, and writes nothing", async () => {
    repo.slotIds.mockResolvedValue(new Set());
    await expect(createPlan(valid, SUB)).rejects.toMatchObject({ code: "invalid_plan", extra: { fields: [{ field: "slotPremiums.0.slotId" }] } });
    expect(repo.savePlan).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  });

  it("a draft is named by a real id", async () => {
    await expect(replaceDraft("not-an-id", valid, SUB)).rejects.toMatchObject({ code: "plan_not_found" });
  });
});

describe("stepsOf — the simulator says how a fee was built, in words", () => {
  const plan: Plan = {
    id: "p", name: "P", kind: "effy", isActive: false, activatedAt: null, baseCents: 300,
    distanceBands: [{ upperKm: 10, addCents: 0 }, { upperKm: null, addCents: 400 }],
    weightBands: [{ upperGrams: 5000, addCents: 0 }, { upperGrams: 20000, addCents: 200 }],
    freeOverCents: 8000, smallOrderUnderCents: 2000, smallOrderFeeCents: 300, todayPremiumCents: 300,
    slotPremiumCents: new Map(), stepCents: 50, floorCents: 400, capCents: 2000,
  };
  const run = (km: number, grams: number, basketCents: number, premiumCents: number) =>
    stepsOf(effyFee({ km, grams, basketCents, premiumCents, plan }), plan);

  it("every part, its band, and the total", () => {
    expect(run(25, 9000, 5000, 300)).toEqual([
      { label: "Base", detail: "every delivery starts here", amount: "3.00" },
      { label: "Distance", detail: "25 km — the last band, with no upper limit", amount: "4.00" },
      { label: "Weight", detail: "9 kg — the band up to 20 kg", amount: "2.00" },
      { label: "Window surcharge", detail: "what the chosen window adds", amount: "3.00" },
      { label: "Total", detail: "what the customer pays for delivery", amount: "12.00" },
    ]);
  });

  it("names the minimum and the small-order fee when they applied", () => {
    const steps = run(2, 100, 1500, 0);
    expect(steps.map((s) => s.label)).toEqual(["Base", "Distance", "Weight", "Minimum fee", "Small-order fee", "Total"]);
    expect(steps.at(-1)!.amount).toBe("7.00");
  });

  it("names free delivery, and the total is nothing", () => {
    const steps = run(25, 9000, 9000, 300);
    expect(steps.find((s) => s.label === "Free delivery")).toEqual({ label: "Free delivery", detail: "the basket (90.00) reaches 80.00", amount: "-12.00" });
    expect(steps.at(-1)!.amount).toBe("0.00");
  });
});
