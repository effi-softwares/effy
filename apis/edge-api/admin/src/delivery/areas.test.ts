import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  readZone: vi.fn(),
  getAreaDecision: vi.fn(),
  areaServiceLevels: vi.fn(),
  localitiesForPostcode: vi.fn(),
  projectAreaServiceLevels: vi.fn(),
  recordAreaDecision: vi.fn(),
  shopsForArea: vi.fn(),
  zonePostcodes: vi.fn(),
}));
vi.mock("./repository", () => repo);

import { configureArea, getArea, markAreaNotServed } from "./areas";
import { isDeliveryError } from "./types";

const ZONE = { id: "z1", code: "REGIONAL", name: "Regional", status: "active" };
const BALLARAT = [{ name: "Alfredton", state: "VIC", postcode: "3350" }];

const kindOf = async (p: Promise<unknown>) =>
  p.then(() => "none").catch((e) => (isDeliveryError(e) ? e.kind : "unknown"));

beforeEach(() => {
  vi.resetAllMocks();
  repo.readZone.mockResolvedValue(ZONE);
  repo.getAreaDecision.mockResolvedValue(null);
  repo.areaServiceLevels.mockResolvedValue([]);
  repo.localitiesForPostcode.mockResolvedValue(BALLARAT);
  repo.shopsForArea.mockResolvedValue([]);
  repo.zonePostcodes.mockResolvedValue(["3350"]);
});

/* ── The three states (FR-012, SC-005) ────────────────────────────────────────────────────────── */

describe("getArea — the three states", () => {
  /**
   * ⚠ THE REGIONAL CLASS. No decision, nothing offered — and before this feature that was
   * indistinguishable from "deliberately not served". Those shoppers were told "we deliver here" and
   * could not check out, and nobody could tell whether it was a choice or an oversight.
   */
  it("reports an area nobody has decided about as UNCONFIGURED", async () => {
    const area = await getArea("z1", "3350");
    expect(area.state).toBe("unconfigured");
    expect(area.decision).toBeNull();
  });

  it("reports a deliberately unserved area as NOT_SERVED, with its provenance", async () => {
    repo.getAreaDecision.mockResolvedValue({
      decision: "not_served",
      note: "No capacity until Q3",
      decidedBy: "sub-abc",
      decidedAt: "2026-08-01T00:00:00.000Z",
    });

    const area = await getArea("z1", "3350");
    expect(area.state).toBe("not_served");
    expect(area.decision?.note).toBe("No capacity until Q3");
    expect(area.decision?.decidedBy).toBe("sub-abc");
  });

  it("reports an area with an active offering as CONFIGURED", async () => {
    repo.areaServiceLevels.mockResolvedValue([
      { method: "standard", enabled: true, feeAmount: "5.00", leadDaysMin: 2, leadDaysMax: 3, sameDayCutoff: null, distinctFees: ["5.00"] },
    ]);

    const area = await getArea("z1", "3350");
    expect(area.state).toBe("configured");
  });

  /** ⚠ SC-005: every area resolves to exactly one of three states. None is ambiguous. */
  it("never leaves an area in two states at once", async () => {
    const area = await getArea("z1", "3350");
    expect(["configured", "not_served", "unconfigured"]).toContain(area.state);
  });

  /** FR-023: an area is shown by the places it covers, not only by four digits. */
  it("carries the places the postcode covers", async () => {
    const area = await getArea("z1", "3350");
    expect(area.places).toEqual([{ name: "Alfredton", state: "VIC" }]);
  });

  /** ⚠ FR-029: every platform method is present, so none can be silently dropped from the UI. */
  it("returns a row for every delivery method the platform supports", async () => {
    const area = await getArea("z1", "3350");
    expect(area.serviceLevels.map((l) => l.method).sort()).toEqual([
      "same_day",
      "scheduled",
      "standard",
    ]);
  });
});

/* ── The projection (FR-010/FR-013) ───────────────────────────────────────────────────────────── */

describe("configureArea", () => {
  const standardOn = {
    serviceLevels: [
      { method: "standard", enabled: true, feeAmount: "5.00", leadDaysMin: 2, leadDaysMax: 3 },
    ],
  };

  it("projects the configuration onto the offering grid", async () => {
    await configureArea("z1", "3350", standardOn, "sub-abc");

    expect(repo.projectAreaServiceLevels).toHaveBeenCalledWith(
      "z1",
      "3350",
      expect.arrayContaining([expect.objectContaining({ method: "standard", enabled: true, feeAmount: "5.00" })]),
      "sub-abc",
    );
  });

  /**
   * ⚠ A REPLACE, NOT A PATCH. A method omitted is a method turned OFF — ambiguity about what is
   * offered is exactly what this feature removes.
   */
  it("treats an omitted method as disabled, not as unchanged", async () => {
    await configureArea("z1", "3350", standardOn, "sub-abc");

    const levels = repo.projectAreaServiceLevels.mock.calls[0]![2] as { method: string }[];
    // Only `standard` was sent, so only `standard` is written — nothing claims same_day is on.
    expect(levels.map((l) => l.method)).toEqual(["standard"]);
  });

  it("refuses an enabled method with no valid fee", async () => {
    expect(
      await kindOf(
        configureArea("z1", "3350", { serviceLevels: [{ method: "standard", enabled: true }] }, "s"),
      ),
    ).toBe("validation");
    expect(repo.projectAreaServiceLevels).not.toHaveBeenCalled();
  });

  /** ⚠ FR-029: the configurable set is EXACTLY the platform's set — a fourth cannot slip in. */
  it("refuses a delivery method the platform does not have", async () => {
    expect(
      await kindOf(
        configureArea("z1", "3350", { serviceLevels: [{ method: "drone", enabled: true, feeAmount: "5.00" }] }, "s"),
      ),
    ).toBe("validation");
  });
});

/* ── Same-day: a promise, not a price (FR-018) ────────────────────────────────────────────────── */

describe("configureArea — the same-day guard", () => {
  const sameDayOn = (ack?: boolean) => ({
    serviceLevels: [
      {
        method: "same_day",
        enabled: true,
        feeAmount: "7.00",
        sameDayCutoff: "14:00",
        ...(ack === undefined ? {} : { noNearbyShopAcknowledged: ack }),
      },
    ],
  });

  /**
   * ⚠ THE ONE PATH IN THIS FEATURE THAT CAN HARM A CUSTOMER.
   *
   * A fee is a business choice the platform can absorb. Same-day is a physical claim about time: it is
   * only true if a shop holding the goods can reach that area today. Offering it otherwise breaks the
   * promise at the moment the shopper is most committed.
   */
  it("REFUSES same-day when no shop is in the area's zone", async () => {
    repo.shopsForArea.mockResolvedValue([
      { shopId: "s1", shopCode: "S1", shopName: "Melbourne", postcode: "3000", inZone: false },
    ]);

    expect(await kindOf(configureArea("z1", "3350", sameDayOn(), "sub"))).toBe("conflict");
    expect(repo.projectAreaServiceLevels).not.toHaveBeenCalled();
  });

  /** ⚠ It is an informed decision, not a block. The admin was shown the problem and chose anyway. */
  it("allows it when the admin acknowledges deliberately", async () => {
    repo.shopsForArea.mockResolvedValue([
      { shopId: "s1", shopCode: "S1", shopName: "Melbourne", postcode: "3000", inZone: false },
    ]);

    await configureArea("z1", "3350", sameDayOn(true), "sub");
    expect(repo.projectAreaServiceLevels).toHaveBeenCalled();
  });

  it("needs no acknowledgement when a shop IS in the zone", async () => {
    repo.shopsForArea.mockResolvedValue([
      { shopId: "s1", shopCode: "S1", shopName: "Ballarat", postcode: "3350", inZone: true },
    ]);

    await configureArea("z1", "3350", sameDayOn(), "sub");
    expect(repo.projectAreaServiceLevels).toHaveBeenCalled();
  });

  /** The guard is specific to same-day — standard delivery is not a timing promise. */
  it("does not gate standard delivery on shop proximity", async () => {
    repo.shopsForArea.mockResolvedValue([]);

    await configureArea(
      "z1",
      "3350",
      { serviceLevels: [{ method: "standard", enabled: true, feeAmount: "5.00" }] },
      "sub",
    );
    expect(repo.projectAreaServiceLevels).toHaveBeenCalled();
  });
});

/* ── "Not served" must actually stop serving (FR-011a) ────────────────────────────────────────── */

describe("markAreaNotServed", () => {
  /**
   * ⚠ THE FIX FOR A DESIGN DEFECT CAUGHT BEFORE IMPLEMENTATION.
   *
   * The first draft of this feature only RECORDED the decision. Serviceability is decided by zone
   * membership, so an area marked "not served" would have carried on answering {"serviced":true} to
   * the storefront — the REGIONAL defect inverted, introduced by the feature meant to prevent it. The
   * repository does both in one transaction; this asserts the service asks for it.
   */
  it("records the decision so the area is withdrawn, not merely annotated", async () => {
    await markAreaNotServed("z1", "3350", { note: "No capacity until Q3" }, "sub-abc");

    expect(repo.recordAreaDecision).toHaveBeenCalledWith(
      "z1",
      "3350",
      "not_served",
      "No capacity until Q3",
      "sub-abc",
    );
  });

  it("accepts a decision with no note", async () => {
    await markAreaNotServed("z1", "3350", {}, "sub-abc");
    expect(repo.recordAreaDecision).toHaveBeenCalledWith("z1", "3350", "not_served", null, "sub-abc");
  });

  it("treats a blank note as no note", async () => {
    await markAreaNotServed("z1", "3350", { note: "   " }, "sub-abc");
    expect(repo.recordAreaDecision).toHaveBeenCalledWith("z1", "3350", "not_served", null, "sub-abc");
  });

  it("rejects something that is not a postcode", async () => {
    expect(await kindOf(markAreaNotServed("z1", "banana", {}, "sub"))).toBe("validation");
    expect(repo.recordAreaDecision).not.toHaveBeenCalled();
  });
});

/* ── ⚠ The zone-vs-area granularity gap (data-model §consequence 3) ───────────────────────────── */

describe("two areas in ONE zone with divergent decisions", () => {
  /**
   * ⚠ THIS IS THE CASE THE DESIGN CANNOT FULLY EXPRESS, TESTED RATHER THAN HIDDEN.
   *
   * The decision record is AREA-granular (`zone_id` + `postcode`), but `delivery_offering` is
   * ZONE-granular. So two areas in one zone share every offering while holding different decisions.
   *
   * What MUST hold — and does — is that `getArea` reports them differently, because the decision is
   * what determines the state. What CANNOT hold is that their offerings differ: configuring Ballarat
   * configures Bendigo too, which is why the editor has to disclose it (T036).
   *
   * Recorded here rather than papered over, because a reader who finds this behaviour later deserves
   * to know it was a known limit rather than an accident.
   */
  const SHARED_OFFERINGS = [
    {
      method: "standard" as const,
      enabled: true,
      feeAmount: "8.00",
      leadDaysMin: 2,
      leadDaysMax: 3,
      sameDayCutoff: null,
      distinctFees: ["8.00"],
    },
  ];

  it("reports each area's OWN decision, even though they share a zone's offerings", async () => {
    repo.areaServiceLevels.mockResolvedValue(SHARED_OFFERINGS);
    repo.localitiesForPostcode.mockResolvedValue([{ name: "Bendigo", state: "VIC", postcode: "3550" }]);

    // Ballarat: no decision → configured, because the zone has an active offering.
    repo.getAreaDecision.mockResolvedValue(null);
    const ballarat = await getArea("z1", "3350");

    // Bendigo: explicitly not served → not_served WINS over the shared active offering.
    repo.getAreaDecision.mockResolvedValue({
      decision: "not_served",
      note: null,
      decidedBy: "sub-abc",
      decidedAt: "2026-08-01T00:00:00.000Z",
    });
    const bendigo = await getArea("z1", "3550");

    expect(ballarat.state).toBe("configured");
    expect(bendigo.state).toBe("not_served");
  });

  /**
   * ⚠ THE LIMIT, ASSERTED SO IT IS NOT MISTAKEN FOR A BUG LATER.
   *
   * Both areas necessarily report the SAME service levels, because the grid is keyed on zone. An
   * admin configuring one has configured the other, and the interface must say so. Fixing this means
   * re-keying `delivery_offering` on postcode — a rewrite of the quoting path, explicitly out of
   * scope (FR-028).
   */
  it("⚠ necessarily reports the SAME service levels for both — the known zone-granularity limit", async () => {
    repo.areaServiceLevels.mockResolvedValue(SHARED_OFFERINGS);
    repo.getAreaDecision.mockResolvedValue(null);

    const ballarat = await getArea("z1", "3350");
    const bendigo = await getArea("z1", "3550");

    const feeFor = (a: typeof ballarat) =>
      a.serviceLevels.find((l) => l.method === "standard")?.feeAmount;
    expect(feeFor(ballarat)).toBe(feeFor(bendigo));
  });
});

/* ── ⚠ The one-fee-per-area invariant (FR-013 / SC-011) ───────────────────────────────────────── */

describe("the projection writes ONE fee per (destination, method)", () => {
  /**
   * ⚠ THIS IS WHAT MAKES FR-013 ENFORCEABLE RATHER THAN MERELY INTENDED.
   *
   * A shopper is charged the same fee for an area regardless of which shop fulfils, because they can
   * never learn which shop it was (hidden fulfilment, 021 FR-019). The projection achieves that by
   * writing ONE price across every origin — and the per-origin grid editor was removed in the same
   * change, because a single edit there would silently undo it.
   *
   * The service hands the repository exactly one fee per method; the repository fans it out. This
   * asserts the first half — the half a future refactor could break without noticing.
   */
  it("hands the repository a single fee per method, never one per origin", async () => {
    await configureArea(
      "z1",
      "3350",
      {
        serviceLevels: [
          { method: "standard", enabled: true, feeAmount: "5.00", leadDaysMin: 2, leadDaysMax: 3 },
        ],
      },
      "sub",
    );

    const levels = repo.projectAreaServiceLevels.mock.calls[0]![2] as {
      method: string;
      feeAmount: string | null;
    }[];

    // One entry per method — no origin dimension survives into the write.
    expect(levels).toHaveLength(1);
    expect(levels[0]!.feeAmount).toBe("5.00");
    expect(JSON.stringify(levels)).not.toContain("origin");
  });

  /** A malformed fee never reaches the grid — the projection writes money, so it validates money. */
  it("refuses a fee that is not money", async () => {
    for (const bad of ["five dollars", "5.000", "-5.00", ""]) {
      vi.clearAllMocks();
      repo.shopsForArea.mockResolvedValue([]);
      expect(
        await kindOf(
          configureArea(
            "z1",
            "3350",
            { serviceLevels: [{ method: "standard", enabled: true, feeAmount: bad }] },
            "sub",
          ),
        ),
      ).toBe("validation");
      expect(repo.projectAreaServiceLevels).not.toHaveBeenCalled();
    }
  });
});
