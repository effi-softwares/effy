import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  areasWithUnknownPlace: vi.fn(),
  unconfiguredAreas: vi.fn(),
  emptyZones: vi.fn(),
}));
vi.mock("./repository", () => repo);

import { deliveryHealth, healthCounts } from "./health";

/**
 * ⚠ THE FIXTURES HERE ARE THE REAL DEFECTS, NOT INVENTED ONES.
 *
 * Both were confirmed against live dev data before this feature was written (031 T002):
 *
 *   3001  in MEL-METRO — Melbourne's PO-box code, no street addresses, no locality names it
 *   3350 + 3550 in REGIONAL — Ballarat and Bendigo, zero active inbound offerings, so the storefront
 *         answers {"serviced":true} and checkout can quote nothing
 *
 * Using the real cases matters because 028 and 029 both shipped tests whose fixtures agreed with the
 * code rather than with the world.
 */
const THE_3001_CASE = [{ zoneCode: "MEL-METRO", postcode: "3001" }];
const THE_REGIONAL_CASE = [
  { zoneCode: "REGIONAL", postcode: "3350" },
  { zoneCode: "REGIONAL", postcode: "3550" },
];

beforeEach(() => {
  vi.resetAllMocks();
  repo.areasWithUnknownPlace.mockResolvedValue([]);
  repo.unconfiguredAreas.mockResolvedValue([]);
  repo.emptyZones.mockResolvedValue([]);
});

describe("deliveryHealth", () => {
  /** ⚠ The 3001 class — an area no locality names. */
  it("reports an area whose postcode matches no known place", async () => {
    repo.areasWithUnknownPlace.mockResolvedValue(THE_3001_CASE);

    const health = await deliveryHealth();
    expect(health.unknownPlace).toEqual(THE_3001_CASE);
    expect(health.unconfigured).toEqual([]);
    expect(health.emptyZones).toEqual([]);
  });

  /**
   * ⚠ THE REGIONAL CLASS — the defect that motivated this feature, and the assertion behind SC-014.
   *
   * These areas are serviceable to the storefront and unquotable at checkout. Nobody could tell
   * whether REGIONAL was deliberately unpriced or simply never finished, which is exactly the
   * ambiguity the decision record removes.
   */
  it("reports areas that are serviceable but have nothing offered", async () => {
    repo.unconfiguredAreas.mockResolvedValue(THE_REGIONAL_CASE);

    const health = await deliveryHealth();
    expect(health.unconfigured).toHaveLength(2);
    expect(health.unconfigured.map((a) => a.postcode)).toEqual(["3350", "3550"]);
  });

  it("reports a zone that serves nobody", async () => {
    repo.emptyZones.mockResolvedValue([{ zoneCode: "PLANNED-NORTH" }]);

    const health = await deliveryHealth();
    expect(health.emptyZones).toEqual([{ zoneCode: "PLANNED-NORTH" }]);
  });

  /**
   * ⚠ SC-009 — a correctly configured system raises ZERO warnings.
   *
   * An indicator that is always lit tells an operator nothing, and it is how the next 3001 goes
   * unnoticed for weeks. This is the assertion that keeps the panel meaningful.
   */
  it("reports nothing at all when the configuration is sound", async () => {
    const health = await deliveryHealth();

    expect(health.unknownPlace).toEqual([]);
    expect(health.unconfigured).toEqual([]);
    expect(health.emptyZones).toEqual([]);
  });

  /** All three classes at once — they are independent, and one must not mask another. */
  it("reports every class independently", async () => {
    repo.areasWithUnknownPlace.mockResolvedValue(THE_3001_CASE);
    repo.unconfiguredAreas.mockResolvedValue(THE_REGIONAL_CASE);
    repo.emptyZones.mockResolvedValue([{ zoneCode: "PLANNED-NORTH" }]);

    const health = await deliveryHealth();
    expect(health.unknownPlace).toHaveLength(1);
    expect(health.unconfigured).toHaveLength(2);
    expect(health.emptyZones).toHaveLength(1);
  });

  /** The three questions are independent, so a slow one must not serialise the others. */
  it("asks all three questions", async () => {
    await deliveryHealth();
    expect(repo.areasWithUnknownPlace).toHaveBeenCalledOnce();
    expect(repo.unconfiguredAreas).toHaveBeenCalledOnce();
    expect(repo.emptyZones).toHaveBeenCalledOnce();
  });
});

describe("healthCounts", () => {
  /**
   * ⚠ Principle VII: counts ONLY. A postcode is location data and an unbounded label value; neither
   * belongs in operational telemetry. If a real metric is ever wired, this is the shape it takes.
   */
  it("reduces to counts and carries no postcode or area name", async () => {
    repo.areasWithUnknownPlace.mockResolvedValue(THE_3001_CASE);
    repo.unconfiguredAreas.mockResolvedValue(THE_REGIONAL_CASE);

    const counts = healthCounts(await deliveryHealth());

    expect(counts).toEqual({ unknown_place: 1, unconfigured: 2, empty_zone: 0 });
    expect(JSON.stringify(counts)).not.toContain("3001");
    expect(JSON.stringify(counts)).not.toContain("3350");
    expect(JSON.stringify(counts)).not.toContain("REGIONAL");
  });
});
