import { beforeEach, describe, expect, it, vi } from "vitest";

// The repository is mocked at the module boundary — the service's validation + activation-gate logic is
// tested without a database (the promotions precedent). Container-backed repo tests run under CI.
const repo = vi.hoisted(() => ({
  listRings: vi.fn(),
  createRing: vi.fn(),
  listPlans: vi.fn(),
  createPlan: vi.fn(),
  readPlan: vi.fn(),
  activeRings: vi.fn(),
  planPricedRingIds: vi.fn(),
  planWeightBandCount: vi.fn(),
  planExists: vi.fn(),
  activatePlan: vi.fn(),
  // zones + suggestion + settings
  listZones: vi.fn(),
  readZone: vi.fn(),
  zoneExists: vi.fn(),
  createZone: vi.fn(),
  updateZone: vi.fn(),
  placesForPostcode: vi.fn(),
  postcodeZoneCode: vi.fn(),
  addZonePostcode: vi.fn(),
  removeZonePostcode: vi.fn(),
  zoneRepresentativePoint: vi.fn(),
  ringsForSuggestion: vi.fn(),
  persistZoneSuggestion: vi.fn(),
  readSettings: vi.fn(),
  upsertSettings: vi.fn(),
}));
vi.mock("./repository", () => repo);

import {
  activatePlan, addPostcode, checkPostcode, createPlan, createRing, removePostcode, suggestRing,
} from "./service";

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

describe("createRing validation", () => {
  it("rejects a non-positive ordinal", async () => {
    await expect(
      createRing({ code: "X", name: "X", ordinal: 0, suggestUpperKm: null }, SUB),
    ).rejects.toMatchObject({ code: "invalid_plan" });
  });

  it("creates a valid ring", async () => {
    repo.createRing.mockResolvedValue({
      id: "r1", code: "INNER", name: "Inner", ordinal: 1, suggestUpperKm: "10.00", status: "active",
    });
    await expect(
      createRing({ code: "INNER", name: "Inner", ordinal: 1, suggestUpperKm: "10.00" }, SUB),
    ).resolves.toBeDefined();
  });
});

describe("checkPostcode disclosure (FR-008/009/010)", () => {
  it("lists every place a postcode makes serviceable + whether it is taken", async () => {
    repo.placesForPostcode.mockResolvedValue([
      { name: "BALLARAT CENTRAL", state: "VIC", postcode: "3350" },
      { name: "ALFREDTON", state: "VIC", postcode: "3350" },
    ]);
    repo.postcodeZoneCode.mockResolvedValue(null);
    const check = await checkPostcode("3350");
    expect(check.placeCount).toBe(2);
    expect(check.unknownPostcode).toBe(false);
    expect(check.inZoneCode).toBeNull();
  });

  it("flags an unknown postcode (no places)", async () => {
    repo.placesForPostcode.mockResolvedValue([]);
    repo.postcodeZoneCode.mockResolvedValue(null);
    const check = await checkPostcode("3001");
    expect(check.unknownPostcode).toBe(true);
  });

  it("rejects a malformed postcode", async () => {
    await expect(checkPostcode("35")).rejects.toMatchObject({ code: "invalid_zone" });
  });
});

describe("addPostcode guards (FR-009/010)", () => {
  beforeEach(() => repo.zoneExists.mockResolvedValue(true));

  it("refuses a postcode already in another zone, naming it", async () => {
    repo.postcodeZoneCode.mockResolvedValue("MEL-INNER");
    await expect(addPostcode("z1", "3121", false, SUB)).rejects.toMatchObject({
      code: "postcode_in_zone",
      detail: { zone: "MEL-INNER" },
    });
    expect(repo.addZonePostcode).not.toHaveBeenCalled();
  });

  it("requires confirm for an unknown postcode", async () => {
    repo.postcodeZoneCode.mockResolvedValue(null);
    repo.placesForPostcode.mockResolvedValue([]);
    await expect(addPostcode("z1", "3001", false, SUB)).rejects.toMatchObject({ code: "unknown_postcode" });
    expect(repo.addZonePostcode).not.toHaveBeenCalled();
  });

  it("adds an unknown postcode when confirmed", async () => {
    repo.postcodeZoneCode.mockResolvedValue(null);
    repo.placesForPostcode.mockResolvedValue([]);
    repo.addZonePostcode.mockResolvedValue(undefined);
    await expect(addPostcode("z1", "3001", true, SUB)).resolves.toMatchObject({ postcode: "3001" });
    expect(repo.addZonePostcode).toHaveBeenCalledWith("z1", "3001", SUB);
  });

  it("adds a known, free postcode", async () => {
    repo.postcodeZoneCode.mockResolvedValue(null);
    repo.placesForPostcode.mockResolvedValue([{ name: "RICHMOND", state: "VIC", postcode: "3121" }]);
    repo.addZonePostcode.mockResolvedValue(undefined);
    const res = await addPostcode("z1", "3121", false, SUB);
    expect(res.placeCount).toBe(1);
    expect(repo.addZonePostcode).toHaveBeenCalledOnce();
  });
});

describe("removePostcode impact (FR-011)", () => {
  it("reports which places stop being serviceable", async () => {
    repo.zoneExists.mockResolvedValue(true);
    repo.placesForPostcode.mockResolvedValue([{ name: "RICHMOND", state: "VIC", postcode: "3121" }]);
    repo.removeZonePostcode.mockResolvedValue(undefined);
    const impact = await removePostcode("z1", "3121", SUB);
    expect(impact.placeCount).toBe(1);
    expect(impact.places[0]!.name).toBe("RICHMOND");
  });
});

describe("suggestRing (FR-015)", () => {
  beforeEach(() => {
    repo.zoneExists.mockResolvedValue(true);
    repo.persistZoneSuggestion.mockResolvedValue(undefined);
  });

  it("refuses when the hub is not set", async () => {
    repo.readSettings.mockResolvedValue(null);
    await expect(suggestRing("z1")).rejects.toMatchObject({ code: "hub_not_set" });
  });

  it("returns no_coordinate when the zone has no located postcode", async () => {
    repo.readSettings.mockResolvedValue({ hubLatitude: "-37.81", hubLongitude: "144.96", samedayPrepBufferMin: 60 });
    repo.zoneRepresentativePoint.mockResolvedValue({ lat: 0, lng: 0, n: 0 });
    const s = await suggestRing("z1");
    expect(s.reason).toBe("no_coordinate");
    expect(s.ringId).toBeNull();
  });

  it("suggests a ring by hub distance", async () => {
    repo.readSettings.mockResolvedValue({ hubLatitude: "-37.8142", hubLongitude: "144.9632", samedayPrepBufferMin: 60 });
    // Ballarat ~105 km from Melbourne → the open-ended EXTENDED ring.
    repo.zoneRepresentativePoint.mockResolvedValue({ lat: -37.5617, lng: 143.8565, n: 3 });
    repo.ringsForSuggestion.mockResolvedValue([
      { id: "inner", suggestUpperKm: 10 },
      { id: "outer", suggestUpperKm: 50 },
      { id: "extended", suggestUpperKm: null },
    ]);
    const s = await suggestRing("z1");
    expect(s.reason).toBe("ok");
    expect(s.ringId).toBe("extended");
    expect(Number(s.hubDistanceKm)).toBeGreaterThan(95);
    expect(repo.persistZoneSuggestion).toHaveBeenCalled();
  });
});
