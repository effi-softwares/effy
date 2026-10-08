import { beforeEach, describe, expect, it, vi } from "vitest";

// The repository is mocked at the module boundary — the service's validation + activation-gate logic is
// tested without a database (the promotions precedent). Container-backed repo tests run under CI.
const repo = vi.hoisted(() => ({
  listRings: vi.fn(),
  listPlans: vi.fn(),
  createPlan: vi.fn(),
  readPlan: vi.fn(),
  activeRings: vi.fn(),
  planPricedRingIds: vi.fn(),
  planWeightBandCount: vi.fn(),
  planExists: vi.fn(),
  activatePlan: vi.fn(),
  readSettings: vi.fn(),
  upsertSettings: vi.fn(),
}));
vi.mock("./repository", () => repo);

import { activatePlan, createPlan } from "./service";

const SUB = "admin-sub";
const validPlan = {
  name: "Launch",
  roundingStep: "0.50",
  floorAmount: "4.00",
  capAmount: "40.00",
  sameDayFactor: "1.800",
  standardFactor: "1.000",
  ringPrices: [{ ringId: "r1", priceAmount: "6.00" }],
  weightBands: [{ upperGrams: 2000, addAmount: "0.00" }],
};

beforeEach(() => vi.clearAllMocks());

describe("createPlan validation (mirrors the DB CHECKs as field errors)", () => {
  it("accepts a valid plan", async () => {
    repo.createPlan.mockResolvedValue({ id: "p1", isActive: false, ...validPlan });
    await expect(createPlan(validPlan, SUB)).resolves.toBeDefined();
    expect(repo.createPlan).toHaveBeenCalledOnce();
  });

  it("rejects same_day < standard (a≥b, FR-022)", async () => {
    await expect(
      createPlan({ ...validPlan, sameDayFactor: "0.900", standardFactor: "1.000" }, SUB),
    ).rejects.toMatchObject({ code: "invalid_plan" });
    expect(repo.createPlan).not.toHaveBeenCalled();
  });

  it("rejects a cap that is not a multiple of the step (SC-005)", async () => {
    await expect(createPlan({ ...validPlan, capAmount: "40.30" }, SUB)).rejects.toMatchObject({
      code: "invalid_plan",
    });
  });

  it("rejects a floor above the cap", async () => {
    await expect(createPlan({ ...validPlan, floorAmount: "50.00" }, SUB)).rejects.toMatchObject({
      code: "invalid_plan",
    });
  });

  it("rejects a non-positive rounding step", async () => {
    await expect(createPlan({ ...validPlan, roundingStep: "0.00" }, SUB)).rejects.toMatchObject({
      code: "invalid_plan",
    });
  });
});

describe("activatePlan completeness gate (FR-051 / SC-016)", () => {
  beforeEach(() => repo.planExists.mockResolvedValue(true));

  it("refuses when an active ring has no price, naming the ring", async () => {
    repo.activeRings.mockResolvedValue([{ id: "r1", code: "INNER" }, { id: "r2", code: "OUTER" }]);
    repo.planPricedRingIds.mockResolvedValue(new Set(["r1"])); // OUTER unpriced
    repo.planWeightBandCount.mockResolvedValue(3);
    await expect(activatePlan("p1", SUB)).rejects.toMatchObject({
      code: "plan_incomplete",
      detail: { missingRings: ["OUTER"] },
    });
    expect(repo.activatePlan).not.toHaveBeenCalled();
  });

  it("refuses when there are no weight bands", async () => {
    repo.activeRings.mockResolvedValue([{ id: "r1", code: "INNER" }]);
    repo.planPricedRingIds.mockResolvedValue(new Set(["r1"]));
    repo.planWeightBandCount.mockResolvedValue(0);
    await expect(activatePlan("p1", SUB)).rejects.toMatchObject({
      code: "plan_incomplete",
      detail: { reason: "no_weight_bands" },
    });
  });

  it("activates a complete plan", async () => {
    repo.activeRings.mockResolvedValue([{ id: "r1", code: "INNER" }]);
    repo.planPricedRingIds.mockResolvedValue(new Set(["r1"]));
    repo.planWeightBandCount.mockResolvedValue(3);
    repo.activatePlan.mockResolvedValue(undefined);
    repo.readPlan.mockResolvedValue({ id: "p1", isActive: true, ...validPlan });
    const plan = await activatePlan("p1", SUB);
    expect(plan.isActive).toBe(true);
    expect(repo.activatePlan).toHaveBeenCalledWith("p1", SUB);
  });

  it("404s an unknown plan", async () => {
    repo.planExists.mockResolvedValue(false);
    await expect(activatePlan("nope", SUB)).rejects.toMatchObject({ code: "plan_not_found" });
  });
});
